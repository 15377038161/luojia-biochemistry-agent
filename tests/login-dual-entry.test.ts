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
  get length(): number { return store.size; },
  clear: (): void => { store.clear(); },
  getItem: (key: string): string | null => store.get(key) ?? null,
  key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
  removeItem: (key: string): void => { store.delete(key); },
  setItem: (key: string, value: string): void => { store.set(key, value); },
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

function mockMe(teacherWorkspace: boolean, defaultWorkspace: 'student' | 'teacher'): void {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ capabilities: { teacherWorkspace }, defaultWorkspace }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
}

// ─────────────────────────────────────────────────────────────
// [真实] 运行时逻辑执行（非源码字符串扫描）
// ─────────────────────────────────────────────────────────────
test('[真实] setSelectedWorkspace / getSelectedWorkspace / clearSelectedWorkspace 读写 sessionStorage', () => {
  auth.clearSelectedWorkspace();
  assert.equal(auth.getSelectedWorkspace(), null, '无入口偏好应为 null 而非默认 student');

  auth.setSelectedWorkspace('teacher');
  assert.equal(auth.getSelectedWorkspace(), 'teacher');

  auth.setSelectedWorkspace('student');
  assert.equal(auth.getSelectedWorkspace(), 'student');

  auth.clearSelectedWorkspace();
  assert.equal(auth.getSelectedWorkspace(), null);
});

test('[真实] resolveLoginDestination 按服务端能力 + 入口偏好安全路由', async () => {
  // 教师身份选「学生入口」→ 教师体验隔离路径（不写正式学生数据）
  mockMe(true, 'teacher');
  auth.setSelectedWorkspace('student');
  assert.equal(await auth.resolveLoginDestination(), '/student/map?practice=1');

  // 学生身份选「学生入口」→ 正式学生首页
  mockMe(false, 'student');
  auth.setSelectedWorkspace('student');
  assert.equal(await auth.resolveLoginDestination(), '/student/map');

  // 教师身份选「教师入口」→ 教师工作台
  mockMe(true, 'teacher');
  auth.setSelectedWorkspace('teacher');
  assert.equal(await auth.resolveLoginDestination(), '/teacher/dashboard');

  // 学生身份选「教师入口」→ 回退学生首页（无教师能力，不越权、不误入教师工作台）
  mockMe(false, 'student');
  auth.setSelectedWorkspace('teacher');
  assert.equal(await auth.resolveLoginDestination(), '/student/map');

  // 无入口偏好（旧会话/直接访问）→ 服务端 defaultWorkspace 决定方向
  auth.clearSelectedWorkspace();
  mockMe(true, 'teacher');
  assert.equal(await auth.resolveLoginDestination(), '/teacher/dashboard');

  auth.clearSelectedWorkspace();
  mockMe(false, 'student');
  assert.equal(await auth.resolveLoginDestination(), '/student/map');
});

test('[真实] 能力查询失败回退最保守学生首页（即使入口偏好被篡改为 teacher）', async () => {
  globalThis.fetch = async () => { throw new Error('network down'); };
  auth.setSelectedWorkspace('teacher');
  assert.equal(await auth.resolveLoginDestination(), '/student/map');
});

// ─────────────────────────────────────────────────────────────
// [契约] 源码契约断言（仅锁定接线不漂移，非运行时多身份权限验收）
// ─────────────────────────────────────────────────────────────
const read = (path: string): string => readFileSync(path, 'utf8');

test('[契约] 教师端接口以 capabilities.teacherWorkspace 为判据返回 403', () => {
  for (const route of ['overview', 'content', 'reviews', 'session', 'student', 'query', 'grade-reviews', 'questions']) {
    assert.match(read(`src/app/api/teacher/${route}/route.ts`), /teacherWorkspace/);
  }
});

test('[契约] practice-session 以 capabilities.teacherPractice 为判据（学生伪造 practice=1 仍 403）', () => {
  const source = read('src/app/api/teacher/practice-session/route.ts');
  assert.match(source, /capabilities\.teacherPractice/);
  assert.match(source, /403/);
});

test('[契约] 学生会话创建拒绝非学生身份（教师不可写正式学生会话）', () => {
  const source = read('src/app/api/student/session/route.ts');
  assert.match(source, /appRole !== 'student'/);
  assert.match(source, /403/);
});

test('[契约] 教师体验评价绕过 sync_outbox，且校验 sessionId 归属 + agent_role=teacher', () => {
  const evaluate = read('src/app/api/student/evaluate/route.ts');
  assert.match(evaluate, /session\.user_id !== identity\.user\.id/); // sessionId 归属
  assert.match(evaluate, /agent_role === 'teacher'/); // 教师体验分支
  assert.match(evaluate, /recordTeacherPracticeEvaluation/); // 教师体验走隔离记录
  assert.match(evaluate, /rpc\('record_text_evaluation'/); // 正式学生才走 RPC（含 outbox）

  const record = read('src/lib/services/evaluation-record.ts');
  assert.match(record, /agent_role !== 'teacher' \|\| session\.user_id !== input\.userId/);
  assert.match(record, /sync_outbox/); // 教师体验绕过 sync_outbox
});

test('[契约] 班级统计只允许学生正式会话（agent_role=student）', () => {
  const scope = read('src/lib/services/teacher-scope.ts');
  assert.match(scope, /\.eq\('agent_role', 'student'\)/);
});

test('[契约] 登录表单双入口 radio + 落地路由按能力解析接线', () => {
  const form = read('src/components/login-form.tsx');
  assert.match(form, /学生入口/);
  assert.match(form, /教师入口/);
  assert.match(form, /role="radiogroup"/);
  assert.match(form, /setSelectedWorkspace/);

  const cb = read('src/components/auth-callback.tsx');
  assert.match(cb, /resolveLoginDestination/);
  assert.match(cb, /clearSelectedWorkspace/);
});
