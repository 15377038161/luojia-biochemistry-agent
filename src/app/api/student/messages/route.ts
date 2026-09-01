import { NextRequest } from 'next/server';
import { answerStudentQuestion } from '@/lib/coze-workflows';
import { getExperimentStep } from '@/domain/experiment';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import type { ApiError } from '@/domain/agent';
import { assertTutorStage, type TutorLearningStage } from '@/lib/tutor';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const body = (await request.json()) as { sessionId?: string; content?: string; learningStage?: 'task' | 'quiz' | 'simulation' | 'review' };
    const content = body.content?.trim() || '';
    if (!body.sessionId || content.length < 2 || content.length > 4000) {
      return fail({ code: 'VALIDATION_ERROR', message: '请输入2—4000字的问题。', retryable: false });
    }
    // 服务端硬边界：客户端必须显式声明学习阶段；答题锁定阶段（知识检验 /
    // 文字推演作答）无论前端是否隐藏都拒绝请求，不依赖客户端自觉。
    let stage: TutorLearningStage;
    try {
      stage = assertTutorStage(body.learningStage);
    } catch (error) {
      const apiError = error as ApiError;
      return fail(apiError, undefined, apiError.code === 'STATE_INVALID' ? 409 : 422);
    }
    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error: sessionError } = await supabase.from('agent_sessions')
      .select('id,current_step,user_id,completed_at').eq('id', body.sessionId).single();
    if (sessionError) throw sessionError;
    if (session.user_id !== identity.user.id) throw new Error('FORBIDDEN');
    if (session.completed_at) {
      return fail({ code: 'STATE_INVALID', message: '该会话已完成，AI 助教不再接受提问。', retryable: false }, undefined, 409);
    }
    const step = getExperimentStep(Number(session.current_step) || 1);
    const { data: answer, runId } = await answerStudentQuestion(step, content, stage === 'review' ? 'review' : 'task');
    const now = new Date().toISOString();
    // 助教响应统一记录 prompt 版本、工作流运行标识与引用依据来源，便于审计。
    const promptVersion = 'TUTOR_V1';
    const rows = [
      { session_id: session.id, role: 'user', kind: 'question', step_no: step.id, content, metadata: { learningStage: stage, promptVersion } },
      { session_id: session.id, role: 'assistant', kind: 'question', step_no: step.id, content: answer, metadata: { workflowRunId: runId, promptVersion, learningStage: stage, citations: [{ source: 'experiment_step', stepId: step.id, label: step.title }] } },
    ];
    const { data, error } = await supabase.from('agent_messages').insert(rows).select('id,role,kind,step_no,content,created_at');
    if (error) throw error;
    return ok((data || []).map((item) => ({ id: item.id, role: item.role, kind: item.kind, stepId: item.step_no, content: item.content, createdAt: item.created_at || now })));
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
