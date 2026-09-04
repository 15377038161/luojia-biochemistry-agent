-- 教师预制知识检验题库：AI 只生成草稿，教师审核后发布给学生。
alter table public.quiz_questions
  add column if not exists status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_quiz_questions_step_status_updated
  on public.quiz_questions(step_no, status, updated_at desc);

-- 题目包含答案与解析，浏览器永远不得直接读取；学生、教师均通过鉴权后的服务端接口访问。
alter table public.quiz_questions enable row level security;
revoke all on table public.quiz_questions from anon, authenticated;

comment on column public.quiz_questions.status is 'draft=教师待审核，published=可供学生抽题，archived=归档';
comment on column public.quiz_questions.created_by is '生成或创建题目的教师';
comment on column public.quiz_questions.updated_at is '题目最后编辑或发布的时间';
