import { NextRequest } from 'next/server';
import { answerStudentQuestion } from '@/lib/coze-workflows';
import { getExperimentStep } from '@/domain/experiment';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
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
    if (body.learningStage === 'quiz' || body.learningStage === 'simulation') {
      return fail({ code: 'STATE_INVALID', message: '知识检验和文字推演期间 AI 助教暂停，提交后可继续提问。', retryable: false }, undefined, 409);
    }
    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error: sessionError } = await supabase.from('agent_sessions')
      .select('id,current_step,user_id').eq('id', body.sessionId).single();
    if (sessionError) throw sessionError;
    if (session.user_id !== identity.user.id) throw new Error('FORBIDDEN');
    const step = getExperimentStep(Number(session.current_step) || 1);
    const { data: answer, runId } = await answerStudentQuestion(step, content, body.learningStage === 'review' ? 'review' : 'task');
    const now = new Date().toISOString();
    const rows = [
      { session_id: session.id, role: 'user', kind: 'question', step_no: step.id, content, metadata: { learningStage: body.learningStage || 'task' } },
      { session_id: session.id, role: 'assistant', kind: 'question', step_no: step.id, content: answer, metadata: { workflowRunId: runId, learningStage: body.learningStage || 'task' } },
    ];
    const { data, error } = await supabase.from('agent_messages').insert(rows).select('id,role,kind,step_no,content,created_at');
    if (error) throw error;
    return ok((data || []).map((item) => ({ id: item.id, role: item.role, kind: item.kind, stepId: item.step_no, content: item.content, createdAt: item.created_at || now })));
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
