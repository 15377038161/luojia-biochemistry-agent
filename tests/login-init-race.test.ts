import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as auth from '../src/lib/auth';

const read = (path: string): string => readFileSync(path, 'utf8');

// ─────────────────────────────────────────────────────────────
// [真实] withTimeout 异步语义（getSession 挂起兜底的核心原语）
// ─────────────────────────────────────────────────────────────

test('[真实] withTimeout 永不 settle 的 promise → 超时 reject（getSession 挂起不再阻塞）', async () => {
  const never = new Promise<never>(() => {});
  await assert.rejects(() => auth.withTimeout(never, 30), /TIMEOUT/);
});

test('[真实] withTimeout late resolve（超时后才 settle）→ 已 reject，旧结果被忽略', async () => {
  let resolveLate!: (v: unknown) => void;
  const late = new Promise((resolve) => {
    resolveLate = resolve;
  });
  const race = auth.withTimeout(late, 30);
  await assert.rejects(race, /TIMEOUT/);
  // 超时后才 settle，不影响已 reject 的 race（旧结果忽略，不覆盖新状态）
  resolveLate({ data: { session: { user: { id: 'u' } } } });
});

test('[真实] withTimeout 快速 resolve → 透传结果，不受超时影响', async () => {
  const result = await auth.withTimeout(Promise.resolve('ok'), 1000);
  assert.equal(result, 'ok');
});

// ─────────────────────────────────────────────────────────────
// [真实] isPublicRoute 公开路由判定
// ─────────────────────────────────────────────────────────────

test('[真实] isPublicRoute 公开路由（首页/登录页/预览）直通，受保护路由不放行', () => {
  assert.equal(auth.isPublicRoute('/'), true);
  assert.equal(auth.isPublicRoute('/login'), true);
  assert.equal(auth.isPublicRoute('/preview/egfp'), true);
  assert.equal(auth.isPublicRoute('/student/map'), false);
  assert.equal(auth.isPublicRoute('/teacher/dashboard'), false);
});

// ─────────────────────────────────────────────────────────────
// [契约] 源码契约断言（锁定接线不漂移）
// ─────────────────────────────────────────────────────────────

test('[契约] AuthGuard 公开路由 fast-path + getSession 超时 + 失败关闭 + 防竞态', () => {
  const src = read('src/components/auth-guard.tsx');
  assert.match(src, /isPublicRoute/);
  assert.match(src, /withTimeout/);
  assert.match(src, /重试/);
  assert.match(src, /返回登录/);
  assert.match(src, /cancelled/);
  assert.match(src, /runIdRef/);
});

test('[契约] resolveLoginDestination 保留教师拒绝回退 + teacherPractice 隔离体验（practice 语义不丢）', () => {
  const src = read('src/lib/auth.ts');
  assert.match(src, /teacherWorkspace/);
  assert.match(src, /teacherPractice/);
  assert.match(src, /TEACHER_PRACTICE_HOME/);
  assert.match(src, /当前身份没有教师权限/);
});
