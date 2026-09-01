import type { DetailedFeedbackIssue, DimensionScores, TextEvaluation } from '@/domain/agent';
import { AiValidationError } from '@/lib/errors';
import { getExperimentStep } from '@/domain/experiment';

const DIMENSION_MAX: DimensionScores = {
  knowledge: 20,
  operation: 30,
  decision: 20,
  troubleshooting: 15,
  analysis: 15,
};

export function detectDeterministicGates(stepId: number, answer: string) {
  const normalized = answer.toLowerCase().replace(/\s+/g, ' ');
  return getExperimentStep(stepId).gates.filter((gate) =>
    gate.patterns.some((pattern) => normalized.includes(pattern.toLowerCase())),
  );
}

function deriveStandardAnswer(stepId: number): string {
  const step = getExperimentStep(stepId);
  return step.keyPoints
    .map((point) => `【${point.label}】${point.hints.join('；')}`)
    .join('\n');
}

function nonEmptyText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeEvaluation(stepId: number, answer: string, input: TextEvaluation): TextEvaluation {
  const gates = detectDeterministicGates(stepId, answer);
  const step = getExperimentStep(stepId);
  const scores = Object.fromEntries(
    Object.entries(DIMENSION_MAX).map(([key, max]) => {
      const raw = input.scores[key as keyof DimensionScores];
      return [key, Math.max(0, Math.min(max, Number.isFinite(raw) ? raw : 0))];
    }),
  ) as unknown as DimensionScores;
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const hasGate = gates.length > 0 || input.safetyAlerts.length > 0;
  const decision = hasGate ? 'revise' : total >= 80 ? 'pass' : input.decision;

  const fallbackIssues: DetailedFeedbackIssue[] = [
    ...input.incorrectPoints.map((point) => ({ point, kind: 'incorrect' as const })),
    ...input.ambiguousPhrases.map((point) => ({ point, kind: 'ambiguous' as const })),
    ...input.missingPoints.map((point) => ({ point, kind: 'missing' as const })),
    ...input.safetyAlerts.map((point) => ({ point, kind: 'safety' as const })),
  ].map(({ point, kind }) => ({
    dimension: getExperimentStep(stepId).keyPoints.find((item) => item.id === point.rubricId)?.dimension ?? 'operation',
    kind,
    title: point.label,
    evidence: { stepId, quote: '', attemptNo: 1 },
    scenario: '当前提交未提供可直接引用的完整证据。',
    impact: kind === 'safety' ? '可能导致方案无法通过Gate检查。' : '会削弱本步方案的完整性与可复核性。',
    causeBoundary: '只能确认本次文字描述存在该问题，不能据此推断日常学习习惯。',
    action: point.guidance,
    check: `重新提交时明确覆盖“${point.label}”，并给出可核对的条件或判断依据。`,
  }));

  return {
    ...input,
    schemaVersion: 'TextEvaluation.v2',
    decision,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    scores,
    safetyAlerts: [
      ...input.safetyAlerts,
      ...gates.map((gate) => ({ rubricId: gate.id, label: gate.label, guidance: gate.guidance })),
    ],
    requiresTeacherReview: input.requiresTeacherReview || input.confidence < 0.65,
    detailedIssues: input.detailedIssues?.length ? input.detailedIssues : fallbackIssues,
    strengths: input.strengths?.length
      ? input.strengths
      : input.coveredPoints.map((point) => point.label),
    reasoningReview: nonEmptyText(input.reasoningReview) ? input.reasoningReview : input.studentFeedback,
    standardAnswer: nonEmptyText(input.standardAnswer) ? input.standardAnswer : deriveStandardAnswer(stepId),
    improvedAnswer: nonEmptyText(input.improvedAnswer)
      ? input.improvedAnswer
      : [
        '在你的原回答基础上补全以下内容后重新表述：',
        ...[...input.missingPoints, ...input.incorrectPoints].map((point) => `- ${point.label}：${point.guidance}`),
        '- 保留原文中已被确认覆盖的部分，只修订缺失或错误的表述。',
      ].join('\n'),
    knowledgeExplanation: nonEmptyText(input.knowledgeExplanation)
      ? input.knowledgeExplanation
      : `本步核心目标：${step.goal}。背景：${step.context}`,
    nextAction: nonEmptyText(input.nextAction)
      ? input.nextAction
      : decision === 'pass'
        ? '本步已通过，请进入下一步并保持“依据—判断—后续动作”的表达方式。'
        : `请先补写：${[...input.missingPoints, ...input.incorrectPoints].slice(0, 2).map((point) => point.label).join('、') || '本步缺失的要点'}，然后重新提交。`,
  };
}

export function totalScore(scores: DimensionScores): number {
  return Object.values(scores).reduce((sum, score) => sum + score, 0);
}

export function assertEvaluation(value: unknown): TextEvaluation {
  if (!value || typeof value !== 'object') throw new AiValidationError('评阅结果不是对象');
  const data = value as Partial<TextEvaluation>;
  if (!['pass', 'revise', 'teacher_review'].includes(String(data.decision))) {
    throw new AiValidationError('评阅结果decision无效');
  }
  if (!data.scores || typeof data.studentFeedback !== 'string' || !Array.isArray(data.questions)) {
    throw new AiValidationError('评阅结果缺少必要字段');
  }
  const arrays = ['coveredPoints', 'missingPoints', 'incorrectPoints', 'ambiguousPhrases', 'safetyAlerts', 'knowledgeChunkIds'] as const;
  for (const key of arrays) if (!Array.isArray(data[key])) throw new AiValidationError(`评阅结果${key}无效`);
  if (data.strengths !== undefined && (!Array.isArray(data.strengths) || !data.strengths.every((item) => typeof item === 'string'))) {
    throw new AiValidationError('评阅结果strengths无效');
  }
  const optionalTextFields = ['reasoningReview', 'standardAnswer', 'improvedAnswer', 'knowledgeExplanation', 'nextAction'] as const;
  for (const key of optionalTextFields) {
    const field = data[key];
    if (field !== undefined && typeof field !== 'string') {
      throw new AiValidationError(`评阅结果${key}无效`);
    }
  }
  return {
    ...(data as TextEvaluation),
    schemaVersion: 'TextEvaluation.v2',
    detailedIssues: Array.isArray(data.detailedIssues) ? data.detailedIssues : [],
    strengths: Array.isArray(data.strengths) ? data.strengths : [],
    reasoningReview: typeof data.reasoningReview === 'string' ? data.reasoningReview : '',
    standardAnswer: typeof data.standardAnswer === 'string' ? data.standardAnswer : '',
    improvedAnswer: typeof data.improvedAnswer === 'string' ? data.improvedAnswer : '',
    knowledgeExplanation: typeof data.knowledgeExplanation === 'string' ? data.knowledgeExplanation : '',
    nextAction: typeof data.nextAction === 'string' ? data.nextAction : '',
  };
}
