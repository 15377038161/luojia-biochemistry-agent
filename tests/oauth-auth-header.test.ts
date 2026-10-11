import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import * as auth from '../src/lib/auth';
import { authFetch } from '../src/lib/authed-fetch';
import { getSupabase } from '../src/lib/supabase';

const read = (path: string): string => readFileSync(path, 'utf8');

// ── 浏览器全局 mock（sessionStorage + localStorage 共用，真实 Storage 语义） ──
const store = new Map<string, string>();
const mockStorage: Storage = {
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
  value: { sessionStorage: mockStorage, localStorage: mockStorage },
  configurable: true,
  writable: true,
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  store.clear();
  globalThis.fetch = originalFetch;
  delete (globalThis.window as unknown as { __SUPABASE_CONFIG__?: unknown }).__SUPABASE_CONFIG__;
});

// ─────────────────────────────────────────────────────────────
// [契约] 源码契约断言（锁定接线不漂移）
// ─────────────────────────────────────────────────────────────

test('[契约] resolveLoginDestination 用 authFetch 携带会话令牌，非原生 fetch', () => {
  const src = read('src/lib/auth.ts');
  assert.match(src, /authFetch\('\/api\/auth\/me'\)/);
});

test('[契约] authFetch 从 session 读 token 注入 Authorization: Bearer', () => {
  const src = read('src/lib/authed-fetch.ts');
  assert.match(src, /Bearer \$\{token\}/);
});

test('[契约] AuthCallback 仅成功（非 /login）才清理入口，失败保留供重试', () => {
  const src = read('src/components/auth-callback.tsx');
  assert.match(src, /route\.target !== '\/login'/);
});

test('[契约] login-form 从 sessionStorage 恢复所选入口（不回退 student）', () => {
  const src = read('src/components/login-form.tsx');
  assert.match(src, /getSelectedWorkspace\(\) \?\? 'student'/);
});

// ─────────────────────────────────────────────────────────────
// [真实] 运行时逻辑执行（resolveLoginDestination 响应分支）
// ─────────────────────────────────────────────────────────────

test('[真实] auth/me 返回 403 → 安全回登录 + 提示（不越权）', async () => {
  globalThis.fetch = async () => new Response('', { status: 403 });
  auth.setSelectedWorkspace('teacher');
  const r = await auth.resolveLoginDestination();
  assert.equal(r.target, '/login');
  assert.ok(r.notice && r.notice.length > 0);
});

// ─────────────────────────────────────────────────────────────
// [真实] authFetch 携带会话令牌（使用假 token，不输出真实 token）
// ─────────────────────────────────────────────────────────────

test('[真实] authFetch 携带会话令牌（假 token 不外泄）', async () => {
  (globalThis.window as unknown as { __SUPABASE_CONFIG__: unknown }).__SUPABASE_CONFIG__ = {
    url: 'https://fake.supabase.co',
    anonKey: 'fake-anon-key',
    tenantId: 'fake-tenant',
  };
  // monkey-patch 单例 client 的 getSession 返回假 session（authFetch 内部 getSupabase() 返回同一单例）
  const client = getSupabase();
  client.auth.getSession = (async () => ({
    data: { session: { access_token: 'FAKE_TOKEN_FOR_TEST' } },
    error: null,
  })) as typeof client.auth.getSession;

  let capturedAuth: string | null = null;
  globalThis.fetch = async (_input: unknown, init?: RequestInit) => {
    capturedAuth = new Headers(init?.headers).get('Authorization');
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await authFetch('/api/auth/me');
  assert.equal(capturedAuth, 'Bearer FAKE_TOKEN_FOR_TEST');
});

test('[真实] authFetch 无 session → 不带 Authorization 仍发请求（无 session 拒绝路径）', async () => {
  (globalThis.window as unknown as { __SUPABASE_CONFIG__: unknown }).__SUPABASE_CONFIG__ = {
    url: 'https://fake.supabase.co',
    anonKey: 'fake-anon-key',
    tenantId: 'fake-tenant',
  };
  const client = getSupabase();
  client.auth.getSession = (async () => ({
    data: { session: null },
    error: null,
  })) as typeof client.auth.getSession;

  let capturedAuth: string | null = null;
  globalThis.fetch = async (_input: unknown, init?: RequestInit) => {
    capturedAuth = new Headers(init?.headers).get('Authorization');
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await authFetch('/api/auth/me');
  assert.equal(capturedAuth, null);
});
