import type { SupabaseClient } from '@supabase/supabase-js';
import { invokeAi } from '@/lib/ai-gateway';

export interface TeacherEvidence {
  type: 'statistic' | 'student_answer' | 'evaluation';
  label: string;
  value: string;
  recordId?: string;
}

export interface TeacherAgentAnswer {
  answer: string;
  scope: string;
  evidence: TeacherEvidence[];
  suggestedActions: string[];
}

function requestedStep(query: string): number | null {
  const match = query.match(/第\s*([1-8一二三四五六七八])\s*步/);
  if (!match) return null;
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8 };
  return Number(match[1]) || map[match[1]] || null;
}

export async function answerTeacherQuery(supabase: SupabaseClient, query: string): Promise<TeacherAgentAnswer> {
  const step = requestedStep(query);
  const [{ data: sessions, error: sessionError }, { data: evaluations, error: evaluationError }] = await Promise.all([
    supabase.from('agent_sessions').select('id,user_id,current_step,completed_at,class_id,profiles!agent_sessions_user_id_fkey(display_name,student_no),classes(name)')
      .eq('agent_role', 'student'),
    supabase.from('evaluations').select('id,decision,confidence,total_score,result,requires_teacher_review,step_attempts!inner(step_no,answer,session_id,version_no)'),
  ]);
  if (sessionError) throw sessionError;
  if (evaluationError) throw evaluationError;
  const studentSessions = sessions || [];
  // 班级统计与证据只允许学生正式实验数据；教师体验会话（agent_role='teacher'）
  // 的评价记录不得进入教师看板。
  const studentSessionIds = new Set(studentSessions.map((item) => item.id));
  const allEvaluations = (evaluations || []).filter((item) => {
    const attempt = item.step_attempts as unknown as { session_id: string };
    return studentSessionIds.has(attempt.session_id);
  });

  if (/待.*复核|需要.*查看|低置信/.test(query)) {
    const records = allEvaluations.filter((item) => item.requires_teacher_review || Number(item.confidence) < 0.65);
    return {
      answer: records.length ? `当前有${records.length}条记录建议教师复核。我已按置信度和提交记录列出证据。` : '当前没有需要教师复核的记录。',
      scope: `演示班级，共${studentSessions.length}名已开始学生`,
      evidence: records.slice(0, 12).map((item) => ({ type: 'evaluation', label: `步骤${(item.step_attempts as unknown as { step_no: number }).step_no} · 置信度`, value: String(item.confidence), recordId: item.id })),
      suggestedActions: records.length ? ['查看具体学生回答', '确认或调整AI结论'] : [],
    };
  }

  if (/遗漏|常见|高频|错误/.test(query)) {
    const counts = new Map<string, number>();
    for (const item of allEvaluations) {
      const attempt = item.step_attempts as unknown as { step_no: number };
      if (step && attempt.step_no !== step) continue;
      const missing = (item.result as { missingPoints?: Array<{ label?: string }> })?.missingPoints || [];
      for (const point of missing) if (point.label) counts.set(point.label, (counts.get(point.label) || 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      answer: ranked.length ? `${step ? `第${step}步` : '八步整体'}最常见的遗漏是：${ranked.map(([label, count]) => `${label}（${count}次）`).join('、')}。` : '当前还没有足够的正式评阅记录来统计遗漏。',
      scope: `${studentSessions.length}名已开始学生，${allEvaluations.length}次正式评阅`,
      evidence: ranked.map(([label, count]) => ({ type: 'statistic', label, value: `${count}次` })),
      suggestedActions: ranked.length ? ['查看对应学生原话', '针对高频遗漏安排课堂提醒'] : [],
    };
  }

  if (step || /完成|进度|多少/.test(query)) {
    const targetStep = step || 8;
    const completed = studentSessions.filter((item) => Boolean(item.completed_at) || Number(item.current_step) > targetStep).length;
    return {
      answer: `共有${studentSessions.length}名学生开始了文字实验，其中${completed}名已经完成第${targetStep}步。`,
      scope: '演示班级当前实时记录',
      evidence: [
        { type: 'statistic', label: '已开始', value: `${studentSessions.length}人` },
        { type: 'statistic', label: `完成第${targetStep}步`, value: `${completed}人` },
      ],
      suggestedActions: ['查看未完成学生', '查看该步骤高频遗漏'],
    };
  }

  const name = query.match(/([\u4e00-\u9fa5]{1,8})(同学|学生)/)?.[1];
  const studentNo = query.match(/(?:学号|编号)\s*[:：]?\s*([A-Za-z0-9_-]{3,30})/)?.[1];
  if (name || studentNo) {
    const target = studentSessions.find((item) => {
      const profile = item.profiles as unknown as { display_name?: string; student_no?: string } | null;
      return Boolean((name && profile?.display_name?.includes(name)) || (studentNo && profile?.student_no === studentNo));
    });
    const lookup = name || studentNo || '';
    if (!target) return { answer: `没有找到与“${lookup}”匹配的授权班级学生记录。`, scope: '当前教师获授权班级', evidence: [], suggestedActions: ['核对学生姓名或学号'] };
    const records = allEvaluations.filter((item) => (item.step_attempts as unknown as { session_id: string }).session_id === target.id);
    const targetProfile = target.profiles as unknown as { display_name?: string } | null;
    const displayName = targetProfile?.display_name || lookup;
    return {
      answer: `${displayName}当前进行到第${Number(target.current_step) || 1}步，共有${records.length}次正式评阅记录；下面列出各步原话，教师可继续追问具体得分、遗漏或完成情况。`,
      scope: `授权班级单个学生：${displayName}`,
      evidence: records.slice(-8).map((item) => {
        const attempt = item.step_attempts as unknown as { step_no: number; answer: string };
        return { type: 'student_answer', label: `步骤${attempt.step_no}原话 · ${item.total_score ?? 0}分 · ${item.decision}`, value: attempt.answer, recordId: item.id };
      }),
      suggestedActions: records.length ? ['查看AI评阅依据', '添加教师补充意见'] : [],
    };
  }

  const evidence: TeacherEvidence[] = allEvaluations.slice(-40).map((item) => {
    const attempt = item.step_attempts as unknown as { step_no: number; answer: string; session_id: string };
    const session = studentSessions.find((candidate) => candidate.id === attempt.session_id);
    const profile = session?.profiles as unknown as { display_name?: string } | null;
    return {
      type: 'evaluation',
      label: `${profile?.display_name || '学生'} · 步骤${attempt.step_no} · ${item.total_score ?? 0}分 · ${item.decision}`,
      value: attempt.answer,
      recordId: item.id,
    };
  });
  if (process.env.ENABLE_AI_FIXTURE === 'true' && process.env.NODE_ENV !== 'production') {
    return { answer: '当前为演示模式。可查询授权班级的进度、成绩、遗漏、待复核记录和学生原始回答。', scope: `当前授权范围，共${studentSessions.length}名已开始学生`, evidence: evidence.slice(0, 12), suggestedActions: ['查看某位学生', '查看高频遗漏', '查看待复核记录'] };
  }
  const response = await invokeAi([
    { role: 'system', content: '你是教师端生物化学学习分析助手。只能依据输入的授权班级证据回答；不得推测未提供的数据，不得扩展到其他班级。回答要明确结论、学生/步骤证据、教学建议，并说明数据范围。使用简体中文。' },
    { role: 'user', content: `教师问题：${query}\n授权范围：${studentSessions.length}名已开始学生\n证据：${JSON.stringify(evidence)}` },
  ], { workload: 'quality', temperature: 0.2, maxTokens: 6_000, deepThinking: true });
  return {
    answer: response.content,
    scope: `当前教师获授权班级，共${studentSessions.length}名已开始学生、${allEvaluations.length}次评阅`,
    evidence: evidence.slice(0, 12),
    suggestedActions: ['查看相关学生完整档案', '按步骤筛选证据', '创建针对性课堂提醒'],
  };
}
