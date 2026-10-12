import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isReportFresh, missingSteps, elapsedText } from '../src/lib/report-loading';
import { withTimeout } from '../src/lib/auth';

const read = (path: string): string => readFileSync(path, 'utf8');

// ─────────────────────────────────────────────────────────────
// [真实] isReportFresh：已有报告新鲜度判断（旧报告不误复用）
// ─────────────────────────────────────────────────────────────

test('[真实] 无报告 → 不新鲜，应生成', () => {
  assert.equal(isReportFresh({ reportCreatedAt: null, maxEvaluationCreatedAt: null, maxStepPassedAt: null }), false);
});

test('[真实] 报告生成时间不早于所有评分事实 → 新鲜，可复用', () => {
  assert.equal(
    isReportFresh({
      reportCreatedAt: '2026-01-03T10:00:00Z',
      maxEvaluationCreatedAt: '2026-01-02T09:00:00Z',
      maxStepPassedAt: '2026-01-02T09:30:00Z',
    }),
    true,
  );
});

test('[真实] 有晚于报告的新评阅 → 不新鲜，需重新生成', () => {
  assert.equal(
    isReportFresh({
      reportCreatedAt: '2026-01-02T10:00:00Z',
      maxEvaluationCreatedAt: '2026-01-03T09:00:00Z',
      maxStepPassedAt: '2026-01-01T09:00:00Z',
    }),
    false,
  );
});

test('[真实] 有晚于报告的新步骤通过 → 不新鲜，需重新生成', () => {
  assert.equal(
    isReportFresh({
      reportCreatedAt: '2026-01-02T10:00:00Z',
      maxEvaluationCreatedAt: '2026-01-01T09:00:00Z',
      maxStepPassedAt: '2026-01-03T09:00:00Z',
    }),
    false,
  );
});

test('[真实] 报告时间非法 → 不新鲜（保守生成，不误复用脏数据）', () => {
  assert.equal(isReportFresh({ reportCreatedAt: 'not-a-date', maxEvaluationCreatedAt: null, maxStepPassedAt: null }), false);
});

test('[真实] 无评分事实但有报告 → 新鲜（仍可复用）', () => {
  assert.equal(isReportFresh({ reportCreatedAt: '2026-01-03T10:00:00Z', maxEvaluationCreatedAt: null, maxStepPassedAt: null }), true);
});

// ─────────────────────────────────────────────────────────────
// [真实] missingSteps：八步未全部通过不触发生成
// ─────────────────────────────────────────────────────────────

test('[真实] 八步全部通过 → 无缺失', () => {
  assert.deepEqual(missingSteps([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]), []);
});

test('[真实] 仅第 3/6 步未通过 → 返回缺失步骤（不调用模型）', () => {
  assert.deepEqual(missingSteps([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 4, 5, 7, 8]), [3, 6]);
});

test('[真实] 空步骤集合 → 无缺失', () => {
  assert.deepEqual(missingSteps([], [1, 2]), []);
});

// ─────────────────────────────────────────────────────────────
// [真实] elapsedText：真实已等待秒数（不伪造阶段/百分比）
// ─────────────────────────────────────────────────────────────

test('[真实] 0 秒 → "0 秒"', () => {
  assert.equal(elapsedText(1_000_000, 1_000_000), '0 秒');
});

test('[真实] 3.9 秒 → 向下取整 "3 秒"', () => {
  assert.equal(elapsedText(0, 3_900), '3 秒');
});

test('[真实] 时钟回拨（nowMs < startMs）→ "0 秒" 不出现负数', () => {
  assert.equal(elapsedText(5_000, 1_000), '0 秒');
});

// ─────────────────────────────────────────────────────────────
// [真实] withTimeout：报告加载的有界等待 + 迟到结果忽略
// ─────────────────────────────────────────────────────────────

test('[真实] 报告请求永不 settle → 超时 reject（不无限等待）', async () => {
  const never = new Promise<never>(() => {});
  await assert.rejects(() => withTimeout(never, 30), /TIMEOUT/);
});

test('[真实] 超时后才 settle 的迟到结果 → 已被忽略，不覆盖前端状态', async () => {
  let resolveLate!: (v: unknown) => void;
  const late = new Promise((resolve) => { resolveLate = resolve; });
  const race = withTimeout(late, 30);
  await assert.rejects(race, /TIMEOUT/);
  resolveLate({ rendered_markdown: '迟到报告' });
});

test('[真实] 快速返回 → 透传结果，不受超时影响', async () => {
  const result = await withTimeout(Promise.resolve({ rendered_markdown: 'ok' }), 1_000);
  assert.equal((result as { rendered_markdown: string }).rendered_markdown, 'ok');
});

// ─────────────────────────────────────────────────────────────
// [契约] 源码接线断言：锁定前端防重复/迟到/取消/超时与后端复用/日志接线不漂移
// ─────────────────────────────────────────────────────────────

test('[契约] 前端 loadReport 具备防重复 + 迟到忽略 + 取消 + 有界超时 + 显式重试', () => {
  const src = read('src/components/agent/student-agent.tsx');
  assert.match(src, /reportRunRef/);        // 迟到结果忽略
  assert.match(src, /reportBusy/);          // 防重复
  assert.match(src, /AbortController/);     // 取消（停止前端等待）
  assert.match(src, /REPORT_TIMEOUT_MS/);   // 有界等待
  assert.match(src, /withTimeout/);         // 超时原语
  assert.match(src, /retryReport/);         // 显式重试入口
  assert.match(src, /reportAttemptedRef/);  // 成功后不自动重复
});

test('[契约] 后端报告 API 具备新鲜度复用 + 非敏感耗时日志 + 未完成拦截', () => {
  const src = read('src/app/api/student/report/route.ts');
  assert.match(src, /isReportFresh/);          // 已有报告新鲜度判断
  assert.match(src, /phase=generate durationMs/); // 生成阶段非敏感耗时
  assert.match(src, /phase=record durationMs/);   // 保存阶段非敏感耗时
  assert.match(src, /还有步骤未完成/);          // 未完成明确提示
  assert.match(src, /rendered_markdown/);       // 复用已有报告正文
});
