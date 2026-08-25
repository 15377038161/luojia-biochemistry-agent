import type { DetailedFeedbackIssue, DimensionScores, TextEvaluation } from '@/domain/agent';
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

export function normalizeEvaluation(stepId: number, answer: string, input: TextEvaluation): TextEvaluation {
  const gates = detectDeterministicGates(stepId, answer);
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
  };
}

export function totalScore(scores: DimensionScores): number {
  return Object.values(scores).reduce((sum, score) => sum + score, 0);
}

export function assertEvaluation(value: unknown): TextEvaluation {
  if (!value || typeof value !== 'object') throw new Error('评阅结果不是对象');
  const data = value as Partial<TextEvaluation>;
  if (!['pass', 'revise', 'teacher_review'].includes(String(data.decision))) {
    throw new Error('评阅结果decision无效');
  }
  if (!data.scores || typeof data.studentFeedback !== 'string' || !Array.isArray(data.questions)) {
    throw new Error('评阅结果缺少必要字段');
  }
  const arrays = ['coveredPoints', 'missingPoints', 'incorrectPoints', 'ambiguousPhrases', 'safetyAlerts', 'knowledgeChunkIds'] as const;
  for (const key of arrays) if (!Array.isArray(data[key])) throw new Error(`评阅结果${key}无效`);
  return {
    ...(data as TextEvaluation),
    schemaVersion: 'TextEvaluation.v2',
    detailedIssues: Array.isArray(data.detailedIssues) ? data.detailedIssues : [],
  };
}
