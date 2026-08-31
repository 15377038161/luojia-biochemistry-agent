import type { ExperimentStep, TextEvaluation } from '@/domain/agent';

export type StepReviewStatus = '讲清楚了' | '需要补充' | '需要修正' | '表达待澄清';

export interface StepReviewRow {
  id: string;
  label: string;
  status: StepReviewStatus;
  studentEvidence: string;
  feedback: string;
  referenceAnswer: string;
}

function feedbackFor(step: ExperimentStep, evaluation: TextEvaluation, pointId: string) {
  const point = step.keyPoints.find((item) => item.id === pointId);
  if (!point) return null;
  const issue = evaluation.detailedIssues.find((item) => item.title === point.label || item.dimension === point.dimension);
  const incorrect = evaluation.incorrectPoints.find((item) => item.rubricId === point.id || item.label === point.label);
  const ambiguous = evaluation.ambiguousPhrases.find((item) => item.rubricId === point.id || item.label === point.label);
  const missing = evaluation.missingPoints.find((item) => item.rubricId === point.id || item.label === point.label);
  const covered = evaluation.coveredPoints.find((item) => item.rubricId === point.id || item.label === point.label);

  if (incorrect) return { status: '需要修正' as const, evidence: issue?.evidence.quote || '', feedback: issue?.action || incorrect.guidance };
  if (ambiguous) return { status: '表达待澄清' as const, evidence: issue?.evidence.quote || '', feedback: issue?.action || ambiguous.guidance };
  if (missing) return { status: '需要补充' as const, evidence: issue?.evidence.quote || '', feedback: issue?.action || missing.guidance };
  if (covered) return { status: '讲清楚了' as const, evidence: covered.quote, feedback: '关键要点已被 AI 从你的原文中识别。继续保持“条件—理由—判断—后续动作”的表达链条。' };
  return { status: '需要补充' as const, evidence: '', feedback: point.hints[2] };
}

export function buildStepReviewRows(step: ExperimentStep, evaluation: TextEvaluation, answers: Record<string, string>): StepReviewRow[] {
  return step.keyPoints.map((point) => {
    const result = feedbackFor(step, evaluation, point.id);
    return {
      id: point.id,
      label: point.label,
      status: result?.status || '需要补充',
      studentEvidence: result?.evidence || answers[point.id]?.trim() || '本次提交未提供可定位的文字证据。',
      feedback: result?.feedback || point.hints[2],
      referenceAnswer: point.hints.join('；'),
    };
  });
}

export function getStepLearningSummary(step: ExperimentStep, evaluation: TextEvaluation) {
  const strengths = evaluation.coveredPoints.map((item) => item.label);
  const actions = [...evaluation.incorrectPoints, ...evaluation.ambiguousPhrases, ...evaluation.missingPoints]
    .map((item) => item.guidance)
    .filter(Boolean);
  return {
    title: `步骤 ${step.id} · ${step.shortTitle}学习报告`,
    strengths: strengths.length > 0 ? strengths : ['已完成本步全部文字推演并获得逐项评阅'],
    actions: actions.length > 0 ? actions : ['保持当前表达结构，并在下一步继续写明判断依据与后续影响。'],
  };
}
