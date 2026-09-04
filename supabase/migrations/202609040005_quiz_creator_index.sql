-- 覆盖题目创建教师外键，避免教师删除/归档时扫描整个题库。
create index if not exists idx_quiz_questions_created_by
  on public.quiz_questions(created_by);
