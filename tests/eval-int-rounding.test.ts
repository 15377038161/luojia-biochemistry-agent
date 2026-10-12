import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeEvaluation, totalScore } from '../src/domain/evaluation';
import { buildEvaluationResultEnvelope } from '../src/lib/services/evaluation-record';
import { getExperimentStep } from '../src/domain/experiment';
import { errorFromUnknown } from '../src/lib/api-result';
import type { TextEvaluation } from '../src/domain/agent';

type Dim = 'knowledge' | 'operation' | 'decision' | 'troubleshooting' | 'analysis';

function makeScores(partial: Partial<Record<Dim, number>>): Record<Dim, number> {
  return { knowledge: 20, operation: 30, decision: 20, troubleshooting: 15, analysis: 15, ...partial };
}

function makeInput(scores: Record<Dim, number>): TextEvaluation {
  return {
    decision: 'pass',
    confidence: 0.8,
    scores,
    studentFeedback: '反馈',
    teacherSummary: '',
    questions: [],
    coveredPoints: [],
    missingPoints: [],
    incorrectPoints: [],
    ambiguousPhrases: [],
    safetyAlerts: [],
    knowledgeChunkIds: [],
    detailedIssues: [],
    strengths: [],
    reasoningReview: '',
    standardAnswer: '',
    improvedAnswer: '',
    knowledgeExplanation: '',
    nextAction: '',
    requiresTeacherReview: false,
  } as unknown as TextEvaluation;
}

// 第 3 步 decision/troubleshooting 两维不在 REQUIRED_EVIDENCE 覆盖内，不受证据封顶影响，
// 是「小数分值直达 ::integer cast」的关键路径，故聚焦这两维做确定性断言。
const STEP = 3;
const ANSWER = '';

test('[真实] 第3步 decision/troubleshooting 小数 → 四舍五入为整数', () => {
  const out = normalizeEvaluation(STEP, ANSWER, makeInput(makeScores({ decision: 18.5, troubleshooting: 12.5 })));
  assert.equal(out.scores.decision, 19);
  assert.equal(out.scores.troubleshooting, 13);
  assert.ok(Number.isInteger(out.scores.decision));
  assert.ok(Number.isInteger(out.scores.troubleshooting));
});

test('[真实] 非有限值（NaN/Infinity）→ 0，不静默通过', () => {
  const out = normalizeEvaluation(STEP, ANSWER, makeInput(makeScores({ decision: NaN, troubleshooting: Infinity })));
  assert.equal(out.scores.decision, 0);
  assert.equal(out.scores.troubleshooting, 0);
});

test('[真实] 越界 / 负数 → 限制到 [0, max]', () => {
  const out = normalizeEvaluation(STEP, ANSWER, makeInput(makeScores({ decision: 999, troubleshooting: -5 })));
  assert.equal(out.scores.decision, 20);
  assert.equal(out.scores.troubleshooting, 0);
});

test('[真实] 满分保持不变', () => {
  const out = normalizeEvaluation(STEP, ANSWER, makeInput(makeScores({ decision: 20, troubleshooting: 15 })));
  assert.equal(out.scores.decision, 20);
  assert.equal(out.scores.troubleshooting, 15);
});

test('[真实] envelope 五维分值均为整数 + 总分一致（含 evidence 封顶后仍整数）', () => {
  const out = normalizeEvaluation(STEP, ANSWER, makeInput(makeScores({ decision: 18.5, troubleshooting: 12.5 })));
  const envelope = buildEvaluationResultEnvelope(getExperimentStep(STEP), out, 'TEST_VERSION');
  for (const key of ['knowledge', 'operation', 'decision', 'troubleshooting', 'analysis'] as const) {
    assert.ok(Number.isInteger(out.scores[key]), `${key} 应为整数，实际 ${out.scores[key]}`);
  }
  assert.ok(Number.isInteger(envelope.score as number), `envelope.score 应为整数，实际 ${envelope.score}`);
  assert.equal(envelope.score, totalScore(out.scores));
});

test('[真实] 数据库 cast 英文错误（22P02）仍分类为 DB_ERROR', () => {
  const result = errorFromUnknown({ code: '22P02', message: 'invalid input syntax for type integer: "17.5"' });
  assert.equal(result.code, 'DB_ERROR');
});
