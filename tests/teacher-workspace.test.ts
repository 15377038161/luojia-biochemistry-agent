import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('教师端拆分为概览、学生、复核和内容四个真实路由', () => {
  const source = read('src/components/agent/teacher-agent.tsx');
  for (const route of ['/teacher/dashboard', '/teacher/students', '/teacher/reviews', '/teacher/content']) {
    assert.match(source, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.doesNotMatch(source, /IntegrationStatusPanel|集成状态|外部服务真实状态/);
});

test('学生管理接口返回专业、年级、班级筛选维度', () => {
  const route = read('src/app/api/teacher/overview/route.ts');
  assert.match(route, /major_name,grade_name,class_name/);
  assert.match(route, /majors: unique/);
  assert.match(route, /grades: unique/);
  assert.match(route, /classes: unique/);
});

test('学习通身份学籍字段有正式落库迁移且缺失时不伪造', () => {
  const migration = read('supabase/migrations/202609020002_teacher_student_dimensions.sql');
  const identity = read('src/lib/supabase-auth.ts');
  // 落库迁移含 4 个学籍字段（snake_case）
  for (const column of ['major_name', 'grade_name', 'class_name', 'academic_source']) {
    assert.match(migration, new RegExp(column));
  }
  // 身份归一化层暴露 3 个学籍字段（camelCase），经 getString 归一化，缺失返回空串不伪造
  for (const field of ['majorName', 'gradeName', 'className']) {
    assert.match(identity, new RegExp(field));
  }
  assert.match(identity, /majorName: getString/);
  assert.match(identity, /return ''/);
});
