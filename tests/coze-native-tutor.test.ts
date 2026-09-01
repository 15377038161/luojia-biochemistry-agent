import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTutorStage, isTutorAllowedWorkstationStage } from '../src/lib/tutor';

test('答题锁定阶段（知识检验/文字推演）服务端硬拒绝，不依赖前端隐藏', () => {
  for (const locked of ['quiz', 'simulation']) {
    assert.throws(() => assertTutorStage(locked), (error) => {
      const apiError = error as { code?: string };
      return apiError.code === 'STATE_INVALID';
    });
  }
});

test('允许阶段（任务/回顾）放行', () => {
  assert.equal(assertTutorStage('task'), 'task');
  assert.equal(assertTutorStage('review'), 'review');
});

test('缺少学习阶段参数时服务端拒绝（不得默认放行）', () => {
  let caught: unknown = null;
  try {
    assertTutorStage(undefined);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, '未声明学习阶段必须拒绝');
  assert.equal((caught as { code: string }).code, 'VALIDATION_ERROR');
});

test('缺失学习阶段参数时返回校验错误而非放行', () => {
  assert.throws(() => assertTutorStage(null), (error) => {
    const apiError = error as { code?: string };
    return apiError.code === 'VALIDATION_ERROR';
  });
});

test('前端工作台：步骤说明与评价页显示助教，答题面板隐藏', () => {
  assert.equal(isTutorAllowedWorkstationStage(0), true, '步骤说明页可用助教');
  assert.equal(isTutorAllowedWorkstationStage(1), false, '知识检验面板隐藏助教');
  assert.equal(isTutorAllowedWorkstationStage(2), false, '文字推演作答面板隐藏助教');
  assert.equal(isTutorAllowedWorkstationStage(3), true, '评价报告页可用助教');
});
