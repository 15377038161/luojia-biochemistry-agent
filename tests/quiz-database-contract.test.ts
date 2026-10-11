import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('题库接口通过 getSessionUser 读取身份，用携带用户 JWT 的客户端限定 user_id 访问', () => {
  for (const route of ['start', 'session', 'submit']) {
    const source = read(`src/app/api/student/quiz/${route}/route.ts`);
    assert.match(source, /getSessionUser\(req\)/);
    assert.match(source, /identity\.supabase/);
    assert.match(source, /user_id/);
    assert.doesNotMatch(source, /supabase\.auth\.getUser\(\)/);
  }
  // 题目答案不泄漏：start 返回前经 clientQuestions 过滤，仅暴露 question_id/question_text/options
  const start = read('src/app/api/student/quiz/start/route.ts');
  assert.match(start, /\{ question_id, question_text, options \}/);
  // 完成会话返回 results（批改结果、得分、总数）
  const submit = read('src/app/api/student/quiz/submit/route.ts');
  assert.match(submit, /return ok\(\{ results, score, total \}\)/);
});

test('题库接口使用正式状态与时间字段，不引用不存在的 completed_at', () => {
  const routes = ['start', 'session', 'submit']
    .map((route) => read(`src/app/api/student/quiz/${route}/route.ts`))
    .join('\n');
  assert.doesNotMatch(routes, /completed_at/);
  assert.match(routes, /status: 'in_progress'/);
  assert.match(routes, /status: 'graded'/);
  assert.match(routes, /submitted_at/);
  assert.match(routes, /graded_at/);
});

test('题目答案表和测验会话表禁止匿名与登录用户直接访问', () => {
  const migration = read('supabase/migrations/202609031502_quiz_access_lockdown.sql');
  const serviceOnly = read('supabase/migrations/202609031503_quiz_service_only_policies.sql');
  assert.match(migration, /alter table public\.quiz_questions enable row level security/i);
  assert.match(migration, /revoke all on table public\.quiz_questions from anon, authenticated/i);
  assert.match(migration, /revoke all on table public\.quiz_sessions from anon, authenticated/i);
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(serviceOnly, /drop policy if exists quiz_sessions_own_read/i);
  assert.match(serviceOnly, /drop policy if exists quiz_sessions_own_insert/i);
  assert.match(serviceOnly, /drop policy if exists quiz_sessions_own_update/i);
});
