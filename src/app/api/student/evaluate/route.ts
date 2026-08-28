import { NextRequest } from 'next/server';
import { getExperimentStep } from '@/domain/experiment';
import { normalizeEvaluation } from '@/domain/evaluation';
import { evaluateText } from '@/lib/coze-workflows';
import { errorFromUnknown, fail, ok, requestId } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';
import { loadStudentSessionView } from '@/lib/student-session';

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  const id = requestId();
  try {
    const body = (await request.json()) as { sessionId?: string; answer?: string; requestId?: string };
    const answer = body.answer?.trim() || '';
    if (!body.sessionId || answer.length < 20 || answer.length > 8000) {
      return fail({ code: 'VALIDATION_ERROR', message: '本步描述至少20字，最多8000字。', retryable: false }, id);
    }
    const key = body.requestId && /^[0-9a-f-]{36}$/i.test(body.requestId) ? body.requestId : crypto.randomUUID();
    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error: sessionError } = await supabase.from('agent_sessions')
      .select('id,current_step,completed_at,user_id').eq('id', body.sessionId).single();
    if (sessionError) throw sessionError;
    if (session.user_id !== identity.user.id) throw new Error('FORBIDDEN');
    const stepNo = Number(session.current_step) || 1;
    const { data: state } = await supabase.from('step_states').select('attempt_count')
      .eq('session_id', session.id).eq('step_no', stepNo).maybeSingle();
    const step = getExperimentStep(stepNo);
    const workflow = await evaluateText(step, answer, (state?.attempt_count ?? 0) + 1);
    const evaluation = normalizeEvaluation(step.id, answer, workflow.data);
    const { error: rpcError } = await supabase.rpc('record_text_evaluation', {
      target_session: session.id,
      target_step: step.id,
      request_key: key,
      student_answer: answer,
      evaluation_result: evaluation,
      prompt_version_value: 'WF-TEXT-v1',
      workflow_run_value: workflow.runId || null,
    });
    if (rpcError) throw rpcError;
    const { data: updated, error: updatedError } = await supabase.from('agent_sessions')
      .select('id,current_step,completed_at').eq('id', session.id).single();
    if (updatedError) throw updatedError;
    const view = await loadStudentSessionView(supabase, updated, identity.user.profile.displayName);
    return ok({ evaluation, session: view }, id);
  } catch (error) {
    return fail(errorFromUnknown(error), id, 500);
  }
}
