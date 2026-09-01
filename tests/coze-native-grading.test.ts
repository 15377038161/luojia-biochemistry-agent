import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeGradeSummary } from '../src/lib/services/grading';
import type { EvaluationFact, GradingFacts, StepStateFact } from '../src/lib/services/grading';

function passedStepStates(): StepStateFact[] {
  return Array.from({ length: 8 }, (_, index) => ({
    stepNo: index + 1,
    status: 'passed',
    attemptCount: 1,
    passedAt: new Date().toISOString(),
  }));
}

function baseFacts(partial: Partial<GradingFacts>): GradingFacts {
  return {
    sessionId: 'session-1',
    completedAt: null,
    stepStates: passedStepStates(),
    evaluations: Array.from({ length: 8 }, (_, index) => evaluationFor(index + 1, 80)),
    finalization: null,
    hasPendingAppeal: false,
    ...partial,
  };
}

function evaluationFor(stepNo: number, total: number): EvaluationFact {
  return {
    id: `eval-${stepNo}`,
    stepNo,
    versionNo: 1,
    decision: 'pass',
    totalScore: total,
    requiresTeacherReview: false,
    scores: { knowledge: total / 5, operation: total / 5, decision: total / 5, troubleshooting: total / 5, analysis: total / 5 },
    result: {
      scores: { knowledge: total / 5, operation: total / 5, decision: total / 5, troubleshooting: total / 5, analysis: total / 5 },
    },
    createdAt: new Date(2026, 0, stepNo).toISOString(),
  };
}

test('成绩计算唯一入口：八步最终有效成绩等权汇总并固定贡献度口径', () => {
  const summary = computeGradeSummary(baseFacts({}));
  assert.equal(summary.step_reports.length, 8, '总分/过程成绩/雷达图/超星同步共用同一份八步成绩');
  assert.equal(summary.process_score, 80, '过程成绩为八步最终有效成绩的平均值');
  assert.equal(summary.contribution_points, 8, '贡献度 = 过程成绩 × 0.1');
  assert.equal(summary.completion, 1);
  assert.equal(summary.status, 'provisional');
  assert.equal(summary.dimensions.length, 5, '雷达图五维度由同一模块输出');
});

test('缺少步骤按 0 分计入过程成绩，未完成会话完成度如实反映', () => {
  const summary = computeGradeSummary(baseFacts({
    stepStates: passedStepStates().slice(0, 4),
    evaluations: Array.from({ length: 4 }, (_, index) => evaluationFor(index + 1, 100)),
  }));
  assert.equal(summary.process_score, 50, '仅 4 步有成绩时等权平均为 50');
  assert.equal(summary.completion, 0.5);
});

test('存在待复核步骤时状态为 review_required，教师复核是唯一人工出口', () => {
  const evaluations = Array.from({ length: 8 }, (_, index) => evaluationFor(index + 1, 80));
  evaluations[4] = { ...evaluations[4], decision: 'teacher_review', requiresTeacherReview: true };
  const summary = computeGradeSummary(baseFacts({ evaluations }));
  assert.equal(summary.status, 'review_required');
  assert.deepEqual(summary.review_required_steps, [5]);
});

test('申诉待处理时状态为 appealed，教师复核生成新版本后为 final', () => {
  assert.equal(computeGradeSummary(baseFacts({ hasPendingAppeal: true })).status, 'appealed');
  const finalized = computeGradeSummary(baseFacts({
    finalization: { status: 'final', finalizedAt: new Date().toISOString(), finalizedBy: 'teacher-1' },
  }));
  assert.equal(finalized.status, 'final');
});
