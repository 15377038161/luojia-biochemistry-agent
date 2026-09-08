-- 前向修复迁移：补齐超星登录依赖但缺失的 schema 对象
-- 背景：202609020002 / 202609040001 未在生产与预览库完整执行，
-- 导致 profiles 缺学籍四列，超星登录写入档案时 PGRST204 -> session_failed。
-- 本迁移全部幂等，可在已部分执行的库上重复运行。

-- 1) profiles 学生学籍维度（原 202609020002 核心）
alter table public.profiles
  add column if not exists major_name text,
  add column if not exists grade_name text,
  add column if not exists class_name text,
  add column if not exists academic_source text;

create index if not exists profiles_academic_dimensions_idx
  on public.profiles (major_name, grade_name, class_name)
  where role = 'student';

-- 2) 学生实验档案表（原 202609040001 核心）
create table if not exists public.student_experiment_profiles (
  session_id uuid primary key references public.agent_sessions(id) on delete cascade,
  target_gene text not null default 'EGFP' check (char_length(target_gene) between 1 and 120),
  sequence_source text not null default 'recommended' check (sequence_source in ('recommended', 'accession', 'pasted')),
  accession text check (accession is null or char_length(accession) between 2 and 80),
  coding_sequence text check (coding_sequence is null or char_length(coding_sequence) between 30 and 200000),
  cloning_strategy text not null default 'recombination' check (cloning_strategy in ('recombination', 'double_digest')),
  design_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (sequence_source = 'recommended' and target_gene = 'EGFP')
    or (sequence_source = 'accession' and accession is not null)
    or (sequence_source = 'pasted' and coding_sequence is not null)
  )
);

alter table public.student_experiment_profiles enable row level security;

drop policy if exists student_experiment_profile_owner_read on public.student_experiment_profiles;
create policy student_experiment_profile_owner_read
  on public.student_experiment_profiles for select to authenticated
  using (
    exists (
      select 1 from public.agent_sessions s
      where s.id = student_experiment_profiles.session_id
        and s.user_id = (select auth.uid())
        and s.agent_role = 'student'
    )
  );

drop policy if exists student_experiment_profile_teacher_read on public.student_experiment_profiles;
create policy student_experiment_profile_teacher_read
  on public.student_experiment_profiles for select to authenticated
  using (
    exists (
      select 1 from public.agent_sessions s
      where s.id = student_experiment_profiles.session_id
        and s.agent_role = 'student'
        and public.is_authorized_teacher(s.class_id)
    )
  );

-- 3) 知识检验唯一索引（原 202609040001 核心）
create unique index if not exists one_in_progress_quiz_per_student_step_idx
  on public.quiz_sessions (user_id, step_no)
  where status = 'in_progress';

create unique index if not exists quiz_questions_step_text_unique_idx
  on public.quiz_questions (step_no, md5(lower(question_text)));