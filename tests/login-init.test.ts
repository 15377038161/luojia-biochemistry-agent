import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import * as auth from '../src/lib/auth';

// ─────────────────────────────────────────────────────────────
// 浏览器全局 mock（真实逻辑执行用）：sessionStorage + fetch。
// 使用真实 Response 对象（非伪造类型），afterEach 统一恢复。
// ─────────────────────────────────────────────────────────────
const store = new Map<string, string>();
const mockSessionStorage: Storage = {
  get length(): number {
    return store.size;
  },
  clear: (): void => {
    store.clear();
  },
  getItem: (key: string): string | null => store.get(key) ?? null,
  key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
  removeItem: (key: string): void => {
    store.delete(key);
  },
  setItem: (key: string, value: string): void => {
    store.set(key, value);
  },
};

Object.defineProperty(globalThis, 'window', {
  value: { sessionStorage: mockSessionStorage },
  configurable: true,
  writable: true,
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  store.clear();
  globalThis.fetch = originalFetch;
});

// ─────────────────────────────────────────────────────────────
// [真实] 运行时逻辑执行（resolveLoginDestination 异常分支）
// ─────────────────────────────────────────────────────────────
test('[真实] auth/me 返回 200 + 坏 JSON（HTML）→ 安全回登录 + 提示，不抛异常', async () => {
  globalThis.fetch = async () =>
    new Response('<html>gateway</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  auth.setSelectedWorkspace('student');
  const r = await auth.resolveLoginDestination();
  assert.equal(r.target, '/login');
  assert.ok(r.notice && r.notice.length > 0, '坏 JSON 应回登录并携带提示');
});

test('[真实] auth/me 返回 302（非 ok）→ 安全回登录 + 提示', async () => {
  globalThis.fetch = async () => new Response('', { status: 302 });
  auth.setSelectedWorkspace('teacher');
  const r = await auth.resolveLoginDestination();
  assert.equal(r.target, '/login');
  assert.ok(r.notice && r.notice.length > 0);
});

test('[真实] auth/me 返回 200 + 空 body（无 capabilities）→ 按 student 回退，不越权进教师台', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  auth.setSelectedWorkspace('teacher');
  const r = await auth.resolveLoginDestination();
  assert.equal(r.target, '/student/map');
  assert.ok(r.notice && r.notice.length > 0, '无能力却选教师入口应回退并提示');
});

test('[真实] 网络异常（fetch reject）→ 安全回登录 + 提示', async () => {
  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  auth.setSelectedWorkspace('student');
  const r = await auth.resolveLoginDestination();
  assert.equal(r.target, '/login');
  assert.ok(r.notice && r.notice.length > 0);
});

// ─────────────────────────────────────────────────────────────
// [契约] 源码契约断言（锁定接线不漂移）
// ─────────────────────────────────────────────────────────────
const read = (path: string): string => readFileSync(path, 'utf8');

test('[契约] getSupabase 优先读运行时 window.__SUPABASE_CONFIG__，回退 NEXT_PUBLIC_*，不暴露 service-role', () => {
  const src = read('src/lib/supabase.ts');
  assert.match(src, /__SUPABASE_CONFIG__/);
  assert.match(src, /NEXT_PUBLIC_CODER_SUPABASE/);
  assert.doesNotMatch(src, /SERVICE_ROLE|service_role/i);
});

test('[契约] AuthGuard 有 try/catch + 重试按钮 + 公开路由（含预览）直接放行', () => {
  const src = read('src/components/auth-guard.tsx');
  assert.match(src, /try/);
  assert.match(src, /catch/);
  assert.match(src, /重试/);
  assert.match(src, /isPublicRoute\(pathname\)/);
});

test('[契约] resolveLoginDestination 对 response.json 有 try/catch 兜底', () => {
  const src = read('src/lib/auth.ts');
  assert.match(src, /身份校验响应异常/);
  assert.match(src, /AbortSignal\.timeout/);
});
