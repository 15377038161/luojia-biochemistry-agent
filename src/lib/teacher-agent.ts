import type { SupabaseClient } from '@supabase/supabase-js';

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
    supabase.from('agent_sessions').select('id,user_id,current_step,completed_at,profiles!agent_sessions_user_id_fkey(display_name)')
      .eq('agent_role', 'student'),
    supabase.from('evaluations').select('id,decision,confidence,total_score,result,requires_teacher_review,step_attempts!inner(step_no,answer,session_id,version_no)'),
  ]);
  if (sessionError) throw sessionError;
  if (evaluationError) throw evaluationError;
  const studentSessions = sessions || [];
  const allEvaluations = evaluations || [];

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

  const name = query.match(/([\u4e00-\u9fa5]{1,4})(同学|学生)/)?.[1];
  if (name) {
    const target = studentSessions.find((item) => {
      const profile = item.profiles as unknown as { display_name?: string } | null;
      return profile?.display_name?.includes(name);
    });
    if (!target) return { answer: `没有找到姓名包含“${name}”的学生记录。`, scope: '演示班级', evidence: [], suggestedActions: ['核对学生姓名或学号'] };
    const records = allEvaluations.filter((item) => (item.step_attempts as unknown as { session_id: string }).session_id === target.id);
    return {
      answer: `${name}同学当前进行到第${target.current_step || 8}步，共有${records.length}次正式评阅记录。`,
      scope: `单个学生：${name}`,
      evidence: records.slice(-8).map((item) => {
        const attempt = item.step_attempts as unknown as { step_no: number; answer: string };
        return { type: 'student_answer', label: `步骤${attempt.step_no}原话`, value: attempt.answer, recordId: item.id };
      }),
      suggestedActions: records.length ? ['查看AI评阅依据', '添加教师补充意见'] : [],
    };
  }

  return {
    answer: '我可以查询班级进度、高频遗漏、待复核记录或某位学生的回答证据。请告诉我想查看的步骤或学生。',
    scope: `演示班级，共${studentSessions.length}名已开始学生`,
    evidence: [],
    suggestedActions: ['查看第3步完成情况', '查看高频遗漏', '查看待复核记录'],
  };
}
