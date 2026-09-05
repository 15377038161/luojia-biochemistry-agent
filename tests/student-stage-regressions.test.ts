import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('知识检验加载状态不再触发自身 effect 循环且重试有独立触发器', () => {
  const source = read('src/components/student/quiz-panel.tsx');
  assert.match(source, /setRetry/);
  assert.doesNotMatch(source, /\}, \[[^\]]*loading[^\]]*\]\)/);
  assert.match(source, /正在恢复学习记录/);
});

test('四组实验执行要点只能同步展开或同步收起', () => {
  const source = read('src/components/student/task-principles.tsx');
  assert.match(source, /showExecutionDetails/);
  assert.match(source, /收起全部/);
  assert.doesNotMatch(source, /open=\{group\.title === 'SOP 参数'\}/);
});

test('实验对象保存按钮使用高对比度专用样式', () => {
  const component = read('src/components/student/experiment-profile-card.tsx');
  const css = read('src/app/globals.css');
  assert.match(component, /gene-profile-save-button/);
  assert.match(css, /gene-profile-save-button\{background:#176f5a!important;color:#fff!important/);
});
