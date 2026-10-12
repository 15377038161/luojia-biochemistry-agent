import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { missingSteps, elapsedText } from '../src/lib/report-loading';
import { withTimeout } from '../src/lib/auth';

const read = (path: string): string => readFileSync(path, 'utf8');

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
// [契约] 前端：POST 生成与 GET 只读查询分离，超时后只读、无结果不盲目生成
// ─────────────────────────────────────────────────────────────

test('[契约] 前端保留防重复/迟到/取消/超时，且超时后只读查询与重新生成分离', () => {
  const src = read('src/components/agent/student-agent.tsx');
  assert.match(src, /reportRunRef/);          // 迟到结果忽略
  assert.match(src, /reportBusy/);            // 防重复/防并发
  assert.match(src, /AbortController/);       // 取消（停止前端等待）
  assert.match(src, /REPORT_TIMEOUT_MS/);     // 有界等待
  assert.match(src, /withTimeout/);           // 超时原语
  assert.match(src, /reportTimedOut/);        // 超时标记（区分按钮）
  assert.match(src, /apiGet/);                // GET 只读查询（不调模型）
  assert.match(src, /queryExistingReport/);   // 超时后「查看是否已生成」只读查询
  assert.match(src, /retryGenerate/);         // 独立「重新生成」按钮（POST）
  assert.doesNotMatch(src, /retryReport/);    // 旧的「重新查询=POST」已移除，不再盲目生成
});

test('[契约] 后端报告 API：删除时间戳近似缓存复用，POST 仅生成，GET 只读，保留非敏感耗时与未完成拦截', () => {
  const src = read('src/app/api/student/report/route.ts');
  assert.doesNotMatch(src, /isReportFresh/);        // 删除时间戳近似缓存（不掩盖教师复核/新评价）
  assert.doesNotMatch(src, /maxEvaluationCreatedAt/); // 删除新鲜度时间戳比较
  assert.match(src, /export async function GET/);   // 只读查询已有报告端点
  assert.match(src, /phase=generate durationMs/);   // 生成阶段非敏感耗时
  assert.match(src, /phase=record durationMs/);     // 保存阶段非敏感耗时
  assert.match(src, /还有步骤未完成/);               // 未完成明确提示 + 返回地图
});
