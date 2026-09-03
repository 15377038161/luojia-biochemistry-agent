import { NextRequest } from 'next/server';
import type { DimensionScores } from '@/domain/agent';
import { experimentSteps } from '@/domain/experiment';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

interface ReportStepRow {
  stepNo: number;
  shortTitle: string;
  status: string;
  attemptCount: number;
  decision: 'pass' | 'revise' | 'teacher_review' | null;
  totalScore: number | null;
  scores: DimensionScores | null;
  missingLabels: string[];
  issues: Array<{
    label: string;
    kind: 'missing' | 'incorrect' | 'ambiguous' | 'safety';
    dimension: keyof DimensionScores | null;
    quote?: string;
    scenario?: string;
    impact?: string;
    causeBoundary?: string;
    action?: string;
    check?: string;
  }>;
}

export interface StudentReportData {
  totalScore: number | null;
  grade: string;
  dimensions: DimensionScores | null;
  steps: ReportStepRow[];
  weakest: Array<{ label: string; count: number }>;
  latestFeedback: string;
  lossAnalysis?: Array<{ label: string; detail: string }>;
  knowledgeGaps?: Array<{ concept: string; gap: string }>;
  improvementSuggestions?: Array<{ dimension: string; suggestion: string }>;
}

const DIMENSION_KEYS: Array<keyof DimensionScores> = ['knowledge', 'operation', 'decision', 'troubleshooting', 'analysis'];

function isDimension(value: unknown): value is keyof DimensionScores {
  return typeof value === 'string' && DIMENSION_KEYS.includes(value as keyof DimensionScores);
}

function parseScores(result: unknown): DimensionScores | null {
  const scores = (result as { scores?: Partial<DimensionScores> } | null)?.scores;
  if (!scores || DIMENSION_KEYS.some((key) => typeof scores[key] !== 'number')) return null;
  return {
    knowledge: scores.knowledge as number,
    operation: scores.operation as number,
    decision: scores.decision as number,
    troubleshooting: scores.troubleshooting as number,
    analysis: scores.analysis as number,
  };
}

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) return fail({ code: 'VALIDATION_ERROR', message: '缺少会话编号。', retryable: false });
    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error: sessionError } = await supabase.from('agent_sessions')
      .select('id,user_id').eq('id', body.sessionId).single();
    if (sessionError) throw sessionError;
    if (session.user_id !== identity.user.id) throw new Error('FORBIDDEN');
    const [{ data: states, error: stateError }, { data: attempts, error: attemptError }] = await Promise.all([
      supabase.from('step_states').select('step_no,status,attempt_count').eq('session_id', session.id).order('step_no'),
      supabase.from('step_attempts')
        .select('step_no,version_no,submitted_at,evaluations(decision,total_score,result)')
        .eq('session_id', session.id)
        .order('submitted_at'),
    ]);
    if (stateError) throw stateError;
    if (attemptError) throw attemptError;

    const keyPointDimensions = new Map(experimentSteps.flatMap((step) => step.keyPoints.map((point) => [point.id, point.dimension] as const)));
    const latestByStep = new Map<number, { decision: 'pass' | 'revise' | 'teacher_review'; totalScore: number | null; scores: DimensionScores | null; missingLabels: string[]; feedback: string; issues: ReportStepRow['issues'] }>();
    for (const attempt of (attempts || []) as Array<{ step_no: number; evaluations: Array<{ decision: 'pass' | 'revise' | 'teacher_review'; total_score: number | string | null; result: unknown }> | null }>) {
      const evaluation = attempt.evaluations?.[attempt.evaluations.length - 1];
      if (!evaluation) continue;
      const score = Number(evaluation.total_score);
      const result = evaluation.result as {
        missingPoints?: Array<{ rubricId?: string; label?: string }>;
        incorrectPoints?: Array<{ rubricId?: string; label?: string }>;
        ambiguousPhrases?: Array<{ rubricId?: string; label?: string }>;
        safetyAlerts?: Array<{ rubricId?: string; label?: string }>;
        studentFeedback?: string;
        detailedIssues?: Array<{
          dimension?: unknown; kind?: unknown; title?: unknown; evidence?: { quote?: unknown };
          scenario?: unknown; impact?: unknown; causeBoundary?: unknown; action?: unknown; check?: unknown;
        }>;
      } | null;
      const issueGroups: Array<{ kind: ReportStepRow['issues'][number]['kind']; points: Array<{ rubricId?: string; label?: string }> }> = [
        { kind: 'missing', points: result?.missingPoints || [] },
        { kind: 'incorrect', points: result?.incorrectPoints || [] },
        { kind: 'ambiguous', points: result?.ambiguousPhrases || [] },
        { kind: 'safety', points: result?.safetyAlerts || [] },
      ];
      const legacyIssues = issueGroups.flatMap(({ kind, points }) => points
        .filter((point) => point.label)
        .map((point) => ({ label: point.label as string, kind, dimension: point.rubricId ? keyPointDimensions.get(point.rubricId) || (kind === 'safety' ? 'operation' : null) : kind === 'safety' ? 'operation' : null })));
      const issues: ReportStepRow['issues'] = result?.detailedIssues?.length
        ? result.detailedIssues.flatMap((issue): ReportStepRow['issues'] => {
          const kind = ['missing', 'incorrect', 'ambiguous', 'safety'].includes(String(issue.kind))
            ? String(issue.kind) as ReportStepRow['issues'][number]['kind'] : 'ambiguous';
          const title = typeof issue.title === 'string' ? issue.title.trim() : '';
          if (!title) return [];
          return [{
            label: title, kind, dimension: isDimension(issue.dimension) ? issue.dimension : null,
            quote: typeof issue.evidence?.quote === 'string' ? issue.evidence.quote : '',
            scenario: typeof issue.scenario === 'string' ? issue.scenario : '',
            impact: typeof issue.impact === 'string' ? issue.impact : '',
            causeBoundary: typeof issue.causeBoundary === 'string' ? issue.causeBoundary : '',
            action: typeof issue.action === 'string' ? issue.action : '',
            check: typeof issue.check === 'string' ? issue.check : '',
          }];
        }) : legacyIssues;
      latestByStep.set(attempt.step_no, {
        decision: evaluation.decision,
        totalScore: Number.isFinite(score) ? score : null,
        scores: parseScores(evaluation.result),
        missingLabels: issues.filter((issue) => issue.kind === 'missing').map((issue) => issue.label),
        feedback: result?.studentFeedback || '',
        issues,
      });
    }

    const missingCounts = new Map<string, number>();
    const steps: ReportStepRow[] = experimentSteps.map((step) => {
      const state = (states || []).find((item) => item.step_no === step.id);
      const latest = latestByStep.get(step.id);
      for (const label of latest?.missingLabels || []) missingCounts.set(label, (missingCounts.get(label) || 0) + 1);
      return {
        stepNo: step.id,
        shortTitle: step.shortTitle,
        status: state?.status || 'locked',
        attemptCount: state?.attempt_count || 0,
        decision: latest?.decision || null,
        totalScore: latest?.totalScore ?? null,
        scores: latest?.scores || null,
        missingLabels: latest?.missingLabels || [],
        issues: latest?.issues || [],
      };
    });

    const scored = steps.filter((item) => item.scores);
    let dimensions: DimensionScores | null = null;
    if (scored.length) {
      const sums = { knowledge: 0, operation: 0, decision: 0, troubleshooting: 0, analysis: 0 };
      for (const item of scored) {
        const itemScores = item.scores as DimensionScores;
        for (const key of DIMENSION_KEYS) sums[key] += itemScores[key];
      }
      dimensions = {
        knowledge: Math.round(sums.knowledge / scored.length),
        operation: Math.round(sums.operation / scored.length),
        decision: Math.round(sums.decision / scored.length),
        troubleshooting: Math.round(sums.troubleshooting / scored.length),
        analysis: Math.round(sums.analysis / scored.length),
      };
    }
    const scoredTotals = steps.filter((item) => item.totalScore != null);
    const totalScore = scoredTotals.length ? Math.round(scoredTotals.reduce((sum, item) => sum + (item.totalScore as number), 0) / scoredTotals.length) : null;
    const grade = totalScore == null ? '尚未评定' : totalScore >= 80 ? '良好' : totalScore >= 60 ? '中等' : '待提高';
    const currentEvaluated = [...latestByStep.entries()].sort((a, b) => b[0] - a[0])[0];
    return ok<StudentReportData>({
      totalScore,
      grade,
      dimensions,
      steps,
      weakest: [...missingCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, count]) => ({ label, count })),
      latestFeedback: currentEvaluated?.[1].feedback || '',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return fail({ code: 'FORBIDDEN', message: '无权查看该会话。', retryable: false }, undefined, 403);
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
