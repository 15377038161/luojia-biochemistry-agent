import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('学生开考只抽已发布题，不在请求中调用 AI', () => {
  const source = read('src/app/api/student/quiz/start/route.ts');
  assert.match(source, /\.eq\('status', 'published'\)/);
  assert.doesNotMatch(source, /generateQuizQuestions/);
  assert.match(source, /暂无足够的未做发布题/);
});

test('教师题库支持 AI 草稿、编辑、发布和归档', () => {
  const api = read('src/app/api/teacher/questions/route.ts');
  const ui = read('src/components/teacher/question-bank-manager.tsx');
  assert.match(api, /generateQuizQuestions\(stepNo, count\)/);
  assert.match(api, /status: 'draft'/);
  assert.match(api, /body\.action === 'publish'/);
  assert.match(api, /export async function PUT/);
  for (const label of ['AI 生成 10 题', '保存草稿', '保存并发布', '归档']) assert.match(ui, new RegExp(label));
});

test('题库草稿状态保存在数据库且浏览器无直接读取权限', () => {
  const migration = read('supabase/migrations/202609040004_teacher_quiz_authoring.sql');
  assert.match(migration, /status text not null default 'published'/i);
  assert.match(migration, /draft.*published.*archived/i);
  assert.match(migration, /created_by uuid references public\.profiles/i);
  assert.match(migration, /revoke all on table public\.quiz_questions from anon, authenticated/i);
});
