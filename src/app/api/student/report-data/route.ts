import { NextRequest } from 'next/server';
import type { DimensionScores } from '@/domain/agent';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { computeGradeSummary, loadGradingFacts, type RadarDimension, type ReportIssue } from '@/lib/services/grading';

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
    kind: ReportIssue['kind'];
    dimension: keyof DimensionScores | null;
    quote?: string;
    scenario?: string;
    impact?: string;
    causeBoundary?: string;
    action?: string;
    check?: string;
  }>;
  strengths?: string[];
  reasoningReview?: string;
  standardAnswer?: string;
  improvedAnswer?: string;
  knowledgeExplanation?: string;
  nextAction?: string;
  resources?: Array<{ label: string; source: string }>;
}

export interface StudentReportData {
  totalScore: number | null;
  grade: string;
  dimensions: DimensionScores | null;
  radarDimensions: RadarDimension[];
  steps: ReportStepRow[];
  weakest: Array<{ label: string; count: number }>;
  latestFeedback: string;
  lossAnalysis: Array<{ label: string; detail: string; evidence: string; action: string; check: string }>;
  knowledgeGaps: Array<{ concept: string; gap: string; evidence: string }>;
  improvementSuggestions: Array<{ dimension: string; suggestion: string; check: string }>;
  gradeStatus: 'provisional' | 'review_required' | 'appealed' | 'final';
}

function gradeName(score: number | null): string {
  if (score === null) return '尚未评定';
  if (score >= 90) return '优秀';
  if (score >= 80) return '良好';
  if (score >= 60) return '中等';
  return '待提高';
}

function asDimension(value: string): keyof DimensionScores | null {
  return ['knowledge', 'operation', 'decision', 'troubleshooting', 'analysis'].includes(value)
    ? value as keyof DimensionScores
    : null;
}

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) return fail({ code: 'VALIDATION_ERROR', message: '缺少会话编号。', retryable: false });

    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error } = await supabase.from('agent_sessions')
      .select('id,user_id').eq('id', body.sessionId).maybeSingle();
    if (error) throw error;
    if (!session || session.user_id !== identity.user.id) throw new Error('FORBIDDEN');

    const facts = await loadGradingFacts(getSupabaseAdminClient(), session.id);
    const summary = computeGradeSummary(facts);
    const scoreByKey = Object.fromEntries(summary.dimensions.map((item) => [item.key, item.score])) as unknown as DimensionScores;
    const stateByStep = new Map(facts.stepStates.map((state) => [state.stepNo, state]));
    const steps: ReportStepRow[] = summary.step_reports.map((report) => {
      const state = stateByStep.get(report.step_no);
      return {
        stepNo: report.step_no,
        shortTitle: report.short_title,
        status: state?.status || 'locked',
        attemptCount: report.attempt_count,
        decision: report.decision,
        totalScore: report.score,
        scores: null,
        missingLabels: report.detailed_issues.filter((issue) => issue.kind === 'missing').map((issue) => issue.label),
        issues: report.detailed_issues.map((issue) => ({
          label: issue.label,
          kind: issue.kind,
          dimension: asDimension(issue.dimension),
          quote: issue.evidence,
          scenario: `步骤${issue.stepNo} · ${issue.stepTitle}`,
          impact: issue.impact,
          causeBoundary: '仅依据本次文字作答，不推断学习态度或真实操作表现。',
          action: issue.action,
          check: issue.check,
        })),
        strengths: report.strengths,
        reasoningReview: report.reasoning_review,
        standardAnswer: report.standard_answer,
        improvedAnswer: report.improved_answer,
        knowledgeExplanation: report.knowledge_explanation,
        nextAction: report.next_action,
        resources: report.resource_refs,
      };
    });
    const counts = new Map<string, number>();
    for (const issue of summary.loss_analysis) counts.set(issue.label, (counts.get(issue.label) || 0) + 1);

    return ok<StudentReportData>({
      totalScore: summary.completion > 0 ? summary.total_score : null,
      grade: gradeName(summary.completion > 0 ? summary.total_score : null),
      dimensions: summary.completion > 0 ? scoreByKey : null,
      radarDimensions: summary.radar_dimensions,
      steps,
      weakest: [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5).map(([label, count]) => ({ label, count })),
      latestFeedback: [...summary.step_reports].reverse().find((item) => item.student_feedback)?.student_feedback || '',
      lossAnalysis: summary.loss_analysis.map((issue) => ({
        label: `步骤${issue.stepNo} · ${issue.label}`,
        detail: issue.impact,
        evidence: issue.evidence,
        action: issue.action,
        check: issue.check,
      })),
      knowledgeGaps: summary.knowledge_gaps,
      improvementSuggestions: summary.improvement_suggestions,
      gradeStatus: summary.status,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return fail({ code: 'FORBIDDEN', message: '无权查看该会话。', retryable: false }, undefined, 403);
    }
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
