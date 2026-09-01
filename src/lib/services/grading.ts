import type { SupabaseClient } from '@supabase/supabase-js';
import type { DimensionScores } from '@/domain/agent';
import { experimentSteps } from '@/domain/experiment';

export type GradeStatus = 'provisional' | 'review_required' | 'appealed' | 'final';

export const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  knowledge: '知识理解',
  operation: '操作描述',
  decision: '科学决策',
  troubleshooting: '问题解决',
  analysis: '结果分析与判断',
};

export interface EvaluationFact {
  id: string;
  stepNo: number;
  versionNo: number;
  decision: 'pass' | 'revise' | 'teacher_review';
  totalScore: number;
  scores: DimensionScores | null;
  requiresTeacherReview: boolean;
  result: Record<string, unknown> | null;
  createdAt: string;
}

export interface StepStateFact {
  stepNo: number;
  status: 'locked' | 'active' | 'passed' | 'teacher_review';
  attemptCount: number;
  passedAt: string | null;
}

export interface GradingFinalization {
  status: GradeStatus;
  finalizedAt: string | null;
  finalizedBy: string | null;
}

export interface GradingFacts {
  sessionId: string;
  completedAt: string | null;
  stepStates: StepStateFact[];
  evaluations: EvaluationFact[];
  finalization: GradingFinalization | null;
  hasPendingAppeal: boolean;
}

export interface StepGradeReport {
  step_no: number;
  title: string;
  short_title: string;
  decision: EvaluationFact['decision'] | null;
  score: number | null;
  attempt_count: number;
  requires_review: boolean;
  strengths: string[];
  missing_points: unknown[];
  reasoning_review: string;
  standard_answer: string;
  improved_answer: string;
  knowledge_explanation: string;
  next_action: string;
}

export interface GradeSummary {
  total_score: number;
  process_score: number;
  contribution_points: number;
  dimensions: Array<{ key: keyof DimensionScores; label: string; score: number; max: number }>;
  step_reports: StepGradeReport[];
  completion: number;
  review_required_steps: number[];
  status: GradeStatus;
  calculated_at: string;
}

const DIMENSION_MAX: DimensionScores = { knowledge: 20, operation: 30, decision: 20, troubleshooting: 15, analysis: 15 };
const STEP_COUNT = experimentSteps.length;

function dimensionScoresFromResult(result: Record<string, unknown> | null): DimensionScores | null {
  const evaluationPart = (result?.evaluation ?? null) as Record<string, unknown> | null;
  const scores = result?.scores ?? evaluationPart?.scores ?? null;
  const source = scores as Partial<DimensionScores> | null;
  if (!source || typeof source !== 'object') return null;
  const picked = {
    knowledge: Number(source.knowledge ?? 0) || 0,
    operation: Number(source.operation ?? 0) || 0,
    decision: Number(source.decision ?? 0) || 0,
    troubleshooting: Number(source.troubleshooting ?? 0) || 0,
    analysis: Number(source.analysis ?? 0) || 0,
  };
  return picked;
}

export function finalEvaluationPerStep(evaluations: EvaluationFact[]): Map<number, EvaluationFact> {
  const best = new Map<number, EvaluationFact>();
  const sorted = [...evaluations].sort((left, right) => left.versionNo - right.versionNo);
  for (const evaluation of sorted) {
    const current = best.get(evaluation.stepNo);
    if (!current) {
      best.set(evaluation.stepNo, evaluation);
      continue;
    }
    const currentIsPass = current.decision === 'pass';
    const nextIsPass = evaluation.decision === 'pass';
    if (nextIsPass && !currentIsPass) {
      best.set(evaluation.stepNo, evaluation);
      continue;
    }
    if (nextIsPass === currentIsPass) best.set(evaluation.stepNo, evaluation);
  }
  return best;
}

export function computeGradeSummary(facts: GradingFacts): GradeSummary {
  const steps = experimentSteps;
  const stateByStep = new Map(facts.stepStates.map((state) => [state.stepNo, state]));
  const finalByStep = finalEvaluationPerStep(facts.evaluations);

  const dimensionsAccumulator: DimensionScores = { knowledge: 0, operation: 0, decision: 0, troubleshooting: 0, analysis: 0 };
  let processScoreTotal = 0;
  const stepReports: StepGradeReport[] = [];
  const reviewRequiredSteps: number[] = [];
  let passedCount = 0;

  for (const step of steps) {
    const evaluation = finalByStep.get(step.id) ?? null;
    const state = stateByStep.get(step.id) ?? null;
    const scores = evaluation?.scores ?? dimensionScoresFromResult(evaluation?.result ?? null);
    if (scores) {
      dimensionsAccumulator.knowledge += scores.knowledge;
      dimensionsAccumulator.operation += scores.operation;
      dimensionsAccumulator.decision += scores.decision;
      dimensionsAccumulator.troubleshooting += scores.troubleshooting;
      dimensionsAccumulator.analysis += scores.analysis;
    }
    const score = evaluation ? Math.round(evaluation.totalScore * 10) / 10 : null;
    if (score !== null) processScoreTotal += score;
    if (state?.status === 'passed') passedCount += 1;

    const result = evaluation?.result ?? null;
    const envelope = (result ?? {}) as Record<string, unknown>;
    const requiresReview = Boolean(evaluation?.requiresTeacherReview) || state?.status === 'teacher_review';
    if (requiresReview) reviewRequiredSteps.push(step.id);

    stepReports.push({
      step_no: step.id,
      title: step.title,
      short_title: step.shortTitle,
      decision: evaluation?.decision ?? null,
      score,
      attempt_count: state?.attemptCount ?? 0,
      requires_review: requiresReview,
      strengths: Array.isArray(envelope.strengths) ? envelope.strengths.filter((value): value is string => typeof value === 'string') : [],
      missing_points: Array.isArray(envelope.missing_points) ? envelope.missing_points : [],
      reasoning_review: typeof envelope.reasoning_review === 'string' ? envelope.reasoning_review : '',
      standard_answer: typeof envelope.standard_answer === 'string' ? envelope.standard_answer : '',
      improved_answer: typeof envelope.improved_answer === 'string' ? envelope.improved_answer : '',
      knowledge_explanation: typeof envelope.knowledge_explanation === 'string' ? envelope.knowledge_explanation : '',
      next_action: typeof envelope.next_action === 'string' ? envelope.next_action : '',
    });
  }

  const dimensions = (Object.keys(DIMENSION_LABELS) as Array<keyof DimensionScores>).map((key) => ({
    key,
    label: DIMENSION_LABELS[key],
    score: Math.min(Math.round(dimensionsAccumulator[key] * 10) / 10, DIMENSION_MAX[key]),
    max: DIMENSION_MAX[key],
  }));

  const totalScore = dimensions.reduce((sum, item) => sum + item.score, 0);
  const processScore = Math.round((processScoreTotal / STEP_COUNT) * 10) / 10;
  const contributionPoints = Math.round(processScore * 0.1 * 10) / 10;

  let status: GradeStatus = 'provisional';
  if (facts.finalization && facts.finalization.status === 'final') status = 'final';
  else if (facts.hasPendingAppeal) status = 'appealed';
  else if (reviewRequiredSteps.length > 0) status = 'review_required';

  return {
    total_score: Math.round(totalScore * 10) / 10,
    process_score: processScore,
    contribution_points: contributionPoints,
    dimensions,
    step_reports: stepReports,
    completion: Math.round((passedCount / STEP_COUNT) * 100) / 100,
    review_required_steps: reviewRequiredSteps,
    status,
    calculated_at: new Date().toISOString(),
  };
}

export function gradingStatusFromReport(content: unknown): GradingFinalization | null {
  if (!content || typeof content !== 'object') return null;
  const grading = (content as Record<string, unknown>).grading;
  if (!grading || typeof grading !== 'object') return null;
  const record = grading as Record<string, unknown>;
  const status = typeof record.status === 'string' ? (record.status as GradeStatus) : null;
  if (!status) return null;
  return {
    status,
    finalizedAt: typeof record.finalized_at === 'string' ? record.finalized_at : null,
    finalizedBy: typeof record.finalized_by === 'string' ? record.finalized_by : null,
  };
}

export async function loadGradingFacts(admin: SupabaseClient, sessionId: string): Promise<GradingFacts> {
  const [{ data: session, error: sessionError }, { data: states, error: stateError }, { data: attemptRows, error: attemptError }, { data: reportRow, error: reportError }, { data: appealRows, error: appealError }] = await Promise.all([
    admin.from('agent_sessions').select('id,completed_at').eq('id', sessionId).maybeSingle(),
    admin.from('step_states').select('step_no,status,attempt_count,passed_at').eq('session_id', sessionId).order('step_no'),
    admin.from('step_attempts').select('step_no,version_no,created_at,evaluations(id,decision,total_score,result,requires_teacher_review,created_at)').eq('session_id', sessionId),
    admin.from('learning_reports').select('content').eq('session_id', sessionId).order('version', { ascending: false }).limit(1).maybeSingle(),
    admin.from('agent_messages').select('metadata').eq('session_id', sessionId).eq('kind', 'grade_review_request'),
  ]);
  if (sessionError) throw sessionError;
  if (stateError) throw stateError;
  if (attemptError) throw attemptError;
  if (reportError) throw reportError;
  if (appealError) throw appealError;

  const evaluations: EvaluationFact[] = [];
  for (const attempt of attemptRows ?? []) {
    const evaluationRows = Array.isArray(attempt.evaluations) ? attempt.evaluations : [];
    for (const row of evaluationRows) {
      const scores = dimensionScoresFromResult((row.result ?? null) as Record<string, unknown> | null);
      evaluations.push({
        id: String(row.id ?? ''),
        stepNo: Number(attempt.step_no) || 0,
        versionNo: Number(attempt.version_no) || 1,
        decision: (row.decision ?? 'revise') as EvaluationFact['decision'],
        totalScore: Number(row.total_score ?? 0) || 0,
        scores,
        requiresTeacherReview: Boolean(row.requires_teacher_review),
        result: (row.result ?? null) as Record<string, unknown> | null,
        createdAt: String(row.created_at ?? ''),
      });
    }
  }

  const hasPendingAppeal = (appealRows ?? []).some((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    return metadata.status === 'pending';
  });

  return {
    sessionId,
    completedAt: session?.completed_at ?? null,
    stepStates: (states ?? []).map((state) => ({
      stepNo: Number(state.step_no) || 0,
      status: (state.status ?? 'locked') as StepStateFact['status'],
      attemptCount: Number(state.attempt_count ?? 0) || 0,
      passedAt: state.passed_at ?? null,
    })),
    evaluations,
    finalization: gradingStatusFromReport(reportRow?.content ?? null),
    hasPendingAppeal,
  };
}

export function buildLearningReportContent(summary: GradeSummary, studyReport: Record<string, unknown> | null, finalization: GradingFinalization | null): Record<string, unknown> {
  const grading: Record<string, unknown> = {
    total_score: summary.total_score,
    process_score: summary.process_score,
    contribution_points: summary.contribution_points,
    status: finalization?.status ?? summary.status,
    dimensions: summary.dimensions.map((item) => ({ dimension: item.label, score: item.score, max: item.max })),
    step_reports: summary.step_reports,
    calculated_at: summary.calculated_at,
    finalized_at: finalization?.finalizedAt ?? null,
    finalized_by: finalization?.finalizedBy ?? null,
  };
  return {
    study_report: studyReport ?? null,
    grading,
    step_reports: summary.step_reports,
  };
}
