import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { loadStudentSessionView } from '@/lib/student-session';
import { evaluateText } from '@/lib/coze-workflows';
import { buildChaoxingTaskflowPayload } from '@/lib/chaoxing-taskflow-contract';
import { errorFromUnknown, fail, ok, requestId } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { getExperimentStep } from '@/domain/experiment';
import {
  buildEvaluationResultEnvelope,
  recordTeacherPracticeEvaluation,
  TEXT_EVAL_PROMPT_VERSION,
} from '@/lib/services/evaluation-record';

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) {
    return fail({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED', retryable: false }, requestId(), 401);
  }
  try {
    const body = (await request.json()) as { sessionId?: string; stepNo?: number; answer?: string; requestId?: string };
    const stepNo = Number(body.stepNo);
    if (!body.sessionId || !Number.isInteger(stepNo) || stepNo < 1 || stepNo > 8 || !body.answer?.trim()) {
      return fail({ code: 'VALIDATION_ERROR', message: '缺少会话、步骤或作答内容。', retryable: false }, requestId(), 400);
    }
    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error } = await supabase
      .from('agent_sessions')
      .select('id,user_id,current_step,completed_at,agent_role')
      .eq('id', body.sessionId)
      .single();
    if (error || !session) throw error ?? new Error('RESOURCE_MISSING');
    if (session.user_id !== identity.user.id) throw new Error('FORBIDDEN');
    if (session.completed_at) throw new Error('STATE_INVALID');
    const currentStep = Number(session.current_step) || 1;
    if (stepNo !== currentStep) throw new Error('STATE_INVALID');
    const step = getExperimentStep(stepNo);
    const { data: state, error: stateError } = await supabase
      .from('step_states')
      .select('attempt_count')
      .eq('session_id', session.id)
      .eq('step_no', stepNo)
      .maybeSingle();
    if (stateError) throw stateError;
    const requestKey = body.requestId?.trim() || randomUUID();
    const admin = getSupabaseAdminClient();
    const { data: experimentProfile, error: profileError } = await admin.from('student_experiment_profiles')
      .select('target_gene,sequence_source,accession,cloning_strategy,design_snapshot').eq('session_id', session.id).maybeSingle();
    if (profileError) throw profileError;
    const workflow = await evaluateText(step, body.answer, Number(state?.attempt_count) || 0, experimentProfile);
    const evaluation = workflow.data;
    const envelope = buildEvaluationResultEnvelope(step, evaluation, TEXT_EVAL_PROMPT_VERSION);
    const ownedSessionId = session.id;
    async function refreshedSessionView() {
      const { data: refreshed, error: refreshError } = await admin.from('agent_sessions')
        .select('id,current_step,completed_at').eq('id', ownedSessionId).eq('user_id', identity!.user.id).single();
      if (refreshError) throw refreshError;
      return loadStudentSessionView(admin, refreshed, identity!.user.profile.displayName ?? '学生');
    }
    if (session.agent_role === 'teacher') {
      // 教师体验：服务端直写，不进入 sync_outbox、学生成绩与学习通同步。
      const record = await recordTeacherPracticeEvaluation(admin, {
        sessionId: session.id,
        userId: identity.user.id,
        stepNo,
        requestKey,
        answer: body.answer,
        evaluation,
        envelope,
        workflowRunId: workflow.runId || null,
      });
      return ok({
        evaluation,
        session: await refreshedSessionView(),
        result: {
          id: record.evaluationId,
          attempt_id: record.attemptId,
          decision: record.decision,
          confidence: record.confidence,
          total_score: Number(envelope.score),
          result: envelope,
        },
      });
    }
    const { data, error: rpcError } = await supabase.rpc('record_text_evaluation', {
      target_session: session.id,
      target_step: stepNo,
      request_key: requestKey,
      student_answer: body.answer,
      evaluation_result: envelope,
      prompt_version_value: TEXT_EVAL_PROMPT_VERSION,
      workflow_run_value: workflow.runId || null,
    });
    if (rpcError) throw rpcError;
    const chaoxingTaskflow = buildChaoxingTaskflowPayload({
      eventId: `text-evaluation:${randomUUID()}`,
      studentId: session.user_id,
      stepId: stepNo,
      versionNo: (Number(state?.attempt_count) || 0) + 1,
      studentAnswer: body.answer,
      evaluation,
    });
    return ok({
      evaluation,
      session: await refreshedSessionView(),
      result: data,
      chaoxingTaskflow,
    });
  } catch (error) {
    return fail(errorFromUnknown(error), requestId(), 500);
  }
}
