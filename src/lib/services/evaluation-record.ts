import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExperimentStep, TextEvaluation } from '@/domain/agent';
import { totalScore } from '@/domain/evaluation';

export const TEXT_EVAL_PROMPT_VERSION = 'TEXT_EVAL_V4_REQUIRED_EVIDENCE';

export type MissingPointKind = 'missing' | 'incorrect' | 'ambiguous' | 'safety';

export interface MissingPointEntry {
  rubricId: string;
  label: string;
  kind: MissingPointKind;
  guidance: string;
}

export interface RubricBreakdownEntry {
  rubricId: string;
  label: string;
  dimension: string;
  matched: boolean;
  evidence: string;
  guidance: string;
}

export interface EvidenceEntry {
  rubricId: string;
  label: string;
  quote: string;
}

export function buildMissingPoints(evaluation: TextEvaluation): MissingPointEntry[] {
  const mapKind = (kind: MissingPointKind) => (point: { rubricId: string; label: string; guidance: string }): MissingPointEntry => ({
    rubricId: point.rubricId,
    label: point.label,
    kind,
    guidance: point.guidance,
  });
  return [
    ...evaluation.missingPoints.map(mapKind('missing')),
    ...evaluation.incorrectPoints.map(mapKind('incorrect')),
    ...evaluation.ambiguousPhrases.map(mapKind('ambiguous')),
    ...evaluation.safetyAlerts.map(mapKind('safety')),
  ];
}

export function buildRubricBreakdown(step: ExperimentStep, evaluation: TextEvaluation): RubricBreakdownEntry[] {
  const missing = buildMissingPoints(evaluation);
  return step.keyPoints.map((point) => {
    const covered = evaluation.coveredPoints.find((p) => p.rubricId === point.id);
    const issue = missing.find((m) => m.rubricId === point.id);
    return {
      rubricId: point.id,
      label: point.label,
      dimension: point.dimension,
      matched: Boolean(covered),
      evidence: covered?.quote ?? '',
      guidance: covered ? '' : issue?.guidance ?? point.hints.join('；'),
    };
  });
}

/**
 * evaluations.result 的正式 JSONB 封套：
 * 顶层包含 step_no / score / decision / strengths / missing_points /
 * reasoning_review / standard_answer / improved_answer / knowledge_explanation /
 * next_action / rubric_breakdown / evidence / prompt_version，
 * evaluation 字段保留完整 TextEvaluation.v2 结构（RPC record_text_evaluation
 * 读取顶层 decision / scores / confidence / requiresTeacherReview /
 * studentFeedback / teacherSummary / safetyAlerts）。
 */
export function buildEvaluationResultEnvelope(
  step: ExperimentStep,
  evaluation: TextEvaluation,
  promptVersion: string,
): Record<string, unknown> {
  return {
    // TextEvaluation.v2 字段平铺在顶层：record_text_evaluation RPC 读取
    // 顶层 decision / scores / confidence / requiresTeacherReview /
    // studentFeedback / teacherSummary / safetyAlerts。
    ...evaluation,
    schemaVersion: 'EvaluationResult.v3',
    step_no: step.id,
    score: totalScore(evaluation.scores),
    missing_points: buildMissingPoints(evaluation),
    reasoning_review: evaluation.reasoningReview,
    standard_answer: evaluation.standardAnswer,
    improved_answer: evaluation.improvedAnswer,
    knowledge_explanation: evaluation.knowledgeExplanation,
    next_action: evaluation.nextAction,
    rubric_breakdown: buildRubricBreakdown(step, evaluation),
    evidence: evaluation.coveredPoints
      .filter((point) => point.quote.trim().length > 0)
      .map((point): EvidenceEntry => ({ rubricId: point.rubricId, label: point.label, quote: point.quote })),
    prompt_version: promptVersion,
  };
}

export interface TeacherRecordInput {
  sessionId: string;
  userId: string;
  stepNo: number;
  requestKey: string;
  answer: string;
  evaluation: TextEvaluation;
  envelope: Record<string, unknown>;
  workflowRunId: string | null;
}

export interface EvaluationRecordResult {
  evaluationId: string;
  attemptId: string;
  versionNo: number;
  decision: TextEvaluation['decision'];
  confidence: number;
  requiresTeacherReview: boolean;
  currentStep: number;
  completed: boolean;
  finalSummary: string | null;
}

/**
 * 教师体验评价的服务端记录：镜像 record_text_evaluation RPC 的语义，
 * 但完全绕过 sync_outbox——教师体验数据不进入超星同步、学生成绩与班级统计。
 */
export async function recordTeacherPracticeEvaluation(
  admin: SupabaseClient,
  input: TeacherRecordInput,
): Promise<EvaluationRecordResult> {
  const { data: existingAttempt, error: existingError } = await admin
    .from('step_attempts')
    .select('id, version_no')
    .eq('request_id', input.requestKey)
    .maybeSingle();
  if (existingError) throw existingError;

  const { data: session, error: sessionError } = await admin
    .from('agent_sessions')
    .select('id, user_id, agent_role, current_step, completed_at')
    .eq('id', input.sessionId)
    .single();
  if (sessionError) throw sessionError;
  if (session.agent_role !== 'teacher' || session.user_id !== input.userId) throw new Error('FORBIDDEN');
  if (session.completed_at) throw new Error('STATE_INVALID');

  const { data: state, error: stateError } = await admin
    .from('step_states')
    .select('id, status, attempt_count')
    .eq('session_id', input.sessionId)
    .eq('step_no', input.stepNo)
    .maybeSingle();
  if (stateError) throw stateError;
  if (!state) throw new Error('STATE_INVALID');

  const versionNo = Number(state.attempt_count ?? 0) + 1;

  if (existingAttempt) {
    const { data: existingEvaluation, error: evalError } = await admin
      .from('evaluations')
      .select('id, decision, confidence, requires_teacher_review')
      .eq('attempt_id', existingAttempt.id)
      .maybeSingle();
    if (evalError) throw evalError;
    return {
      evaluationId: existingEvaluation?.id ?? '',
      attemptId: existingAttempt.id,
      versionNo: Number(existingAttempt.version_no ?? versionNo),
      decision: (existingEvaluation?.decision ?? input.evaluation.decision) as TextEvaluation['decision'],
      confidence: Number(existingEvaluation?.confidence ?? input.evaluation.confidence),
      requiresTeacherReview: Boolean(existingEvaluation?.requires_teacher_review ?? input.evaluation.requiresTeacherReview),
      currentStep: Number(session.current_step) || 1,
      completed: false,
      finalSummary: null,
    };
  }

  const { data: attempt, error: attemptError } = await admin
    .from('step_attempts')
    .insert({
      session_id: input.sessionId,
      step_no: input.stepNo,
      version_no: versionNo,
      answer: input.answer,
      request_id: input.requestKey,
    })
    .select('id')
    .single();
  if (attemptError) throw attemptError;

  const { data: evaluationRow, error: evaluationError } = await admin
    .from('evaluations')
    .insert({
      attempt_id: attempt.id,
      workflow_run_id: input.workflowRunId,
      prompt_version: TEXT_EVAL_PROMPT_VERSION,
      result: input.envelope,
      decision: input.evaluation.decision,
      confidence: input.evaluation.confidence,
      requires_teacher_review: input.evaluation.requiresTeacherReview,
      total_score: totalScore(input.evaluation.scores),
    })
    .select('id')
    .single();
  if (evaluationError) throw evaluationError;

  const now = new Date().toISOString();
  const decision = input.evaluation.decision;

  const statePatch: Record<string, unknown> = { attempt_count: versionNo, updated_at: now };
  if (decision === 'pass') {
    statePatch.status = 'passed';
    statePatch.passed_at = now;
    statePatch.final_summary = input.evaluation.teacherSummary;
  } else if (decision === 'teacher_review') {
    statePatch.status = 'teacher_review';
  }
  const { error: stateUpdateError } = await admin
    .from('step_states')
    .update(statePatch)
    .eq('id', state.id);
  if (stateUpdateError) throw stateUpdateError;

  let currentStep = Number(session.current_step) || 1;
  let completed = false;
  if (decision === 'pass') {
    if (input.stepNo >= 8) {
      completed = true;
      await admin.from('agent_sessions').update({ completed_at: now }).eq('id', input.sessionId);
    } else {
      currentStep = input.stepNo + 1;
      await admin.from('agent_sessions').update({ current_step: currentStep }).eq('id', input.sessionId);
      await admin
        .from('step_states')
        .update({ status: 'active', updated_at: now })
        .eq('session_id', input.sessionId)
        .eq('step_no', currentStep);
    }
  }

  await admin.from('agent_messages').insert({
    session_id: input.sessionId,
    role: 'assistant',
    kind: 'feedback',
    step_no: input.stepNo,
    content: input.evaluation.studentFeedback,
    metadata: {
      evaluationId: evaluationRow.id,
      decision,
      score: totalScore(input.evaluation.scores),
      requiresTeacherReview: input.evaluation.requiresTeacherReview,
      promptVersion: TEXT_EVAL_PROMPT_VERSION,
      workflowRunId: input.workflowRunId,
    },
  });

  return {
    evaluationId: evaluationRow.id,
    attemptId: attempt.id,
    versionNo,
    decision,
    confidence: input.evaluation.confidence,
    requiresTeacherReview: input.evaluation.requiresTeacherReview,
    currentStep,
    completed,
    finalSummary: decision === 'pass' ? input.evaluation.teacherSummary : null,
  };
}
