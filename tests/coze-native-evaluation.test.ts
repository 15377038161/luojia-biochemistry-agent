// Coze 原生评价契约测试：evaluations.result JSONB 必须正式保存
// step_no/score/decision/strengths/missing_points/reasoning_review/
// standard_answer/improved_answer/knowledge_explanation/next_action/
// rubric_breakdown/evidence/prompt_version。
import test from 'node:test';
import assert from 'node:assert/strict';
import { getExperimentStep } from '@/domain/experiment';
import { normalizeEvaluation, assertEvaluation } from '@/domain/evaluation';
import { AiValidationError } from '@/lib/errors';
import { fixtureEvaluation } from '@/lib/coze-workflows';
import { buildEvaluationResultEnvelope, TEXT_EVAL_PROMPT_VERSION } from '@/lib/services/evaluation-record';

const REQUIRED_KEYS = [
  'step_no', 'score', 'decision', 'strengths', 'missing_points', 'reasoning_review',
  'standard_answer', 'improved_answer', 'knowledge_explanation', 'next_action',
  'rubric_breakdown', 'evidence', 'prompt_version',
] as const;

test('评价结果 JSONB 包含全部正式字段', () => {
  const step = getExperimentStep(3);
  const evaluation = normalizeEvaluation(step.id, '学生回答', fixtureEvaluation(step, '学生回答'));
  const envelope = buildEvaluationResultEnvelope(step, evaluation, TEXT_EVAL_PROMPT_VERSION) as Record<string, unknown>;
  for (const key of REQUIRED_KEYS) {
    assert.ok(key in envelope, `evaluations.result 缺少正式字段 ${key}`);
  }
  assert.equal(envelope.step_no, step.id);
  assert.equal(envelope.prompt_version, TEXT_EVAL_PROMPT_VERSION);
  assert.ok(Array.isArray(envelope.strengths));
  assert.ok(Array.isArray(envelope.missing_points));
  assert.ok(Array.isArray(envelope.rubric_breakdown));
  assert.ok(Array.isArray(envelope.evidence));
  assert.ok(typeof envelope.standard_answer === 'string' && (envelope.standard_answer as string).length > 0);
  assert.ok(typeof envelope.improved_answer === 'string');
  assert.ok(typeof envelope.knowledge_explanation === 'string');
  // TextEvaluation.v2 顶层字段必须保留，供 record_text_evaluation RPC 读取
  assert.ok('scores' in envelope && 'decision' in envelope && 'studentFeedback' in envelope);
});

test('rubric_breakdown 与评分点一一对应且包含匹配状态', () => {
  const step = getExperimentStep(2);
  const evaluation = normalizeEvaluation(step.id, '学生回答', fixtureEvaluation(step, '学生回答'));
  const envelope = buildEvaluationResultEnvelope(step, evaluation, TEXT_EVAL_PROMPT_VERSION) as Record<string, unknown>;
  const breakdown = envelope.rubric_breakdown as Array<{ rubricId: string; matched: boolean }>;
  assert.equal(breakdown.length, step.keyPoints.length);
  assert.ok(breakdown.every((item) => typeof item.matched === 'boolean'));
});

test('assertEvaluation 拒绝非法 AI 输出并抛出 AiValidationError', () => {
  assert.throws(() => assertEvaluation({ decision: 'unknown' }), AiValidationError);
  assert.throws(() => assertEvaluation(null), AiValidationError);
  const step = getExperimentStep(1);
  const valid = assertEvaluation(fixtureEvaluation(step, '回答'));
  assert.equal(valid.schemaVersion, 'TextEvaluation.v2');
});
