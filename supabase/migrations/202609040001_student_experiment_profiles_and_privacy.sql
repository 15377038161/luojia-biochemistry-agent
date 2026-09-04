-- 学生自选基因档案与最小权限收敛。
-- 所有写入均通过完成身份/会话校验的服务端 API；RLS 作为第二道边界。

create table if not exists public.student_experiment_profiles (
  session_id uuid primary key references public.agent_sessions(id) on delete cascade,
  target_gene text not null default 'EGFP' check (char_length(target_gene) between 1 and 120),
  sequence_source text not null default 'recommended' check (sequence_source in ('recommended', 'accession', 'pasted')),
  accession text check (accession is null or char_length(accession) between 2 and 80),
  coding_sequence text check (
    coding_sequence is null or (
      char_length(coding_sequence) between 30 and 200000
      and coding_sequence ~ '^[ACGTNacgtn]+$'
    )
  ),
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

create unique index if not exists one_in_progress_quiz_per_student_step_idx
on public.quiz_sessions(user_id, step_no)
where status = 'in_progress';

create unique index if not exists quiz_questions_step_text_unique_idx
on public.quiz_questions(step_no, md5(lower(question_text)));

-- 撤销 public schema 的默认宽权限，再按现有浏览器会话真实需要显式开放。
revoke all on all tables in schema public from anon, authenticated;

grant select on table
  public.profiles,
  public.courses,
  public.classes,
  public.enrollments,
  public.experiments,
  public.experiment_steps,
  public.rubrics,
  public.rubric_items,
  public.knowledge_chunks,
  public.instrument_catalog,
  public.image_questions,
  public.content_versions,
  public.agent_sessions,
  public.agent_messages,
  public.step_states,
  public.step_attempts,
  public.evaluations,
  public.media_submissions,
  public.learning_reports,
  public.teacher_reviews
to authenticated;

grant insert, update on table public.agent_sessions to authenticated;
grant insert on table public.agent_messages to authenticated;
grant insert on table public.media_submissions to authenticated;
grant insert on table public.learning_reports to authenticated;
grant insert on table public.teacher_reviews to authenticated;

revoke all on table
  public.student_experiment_profiles,
  public.quiz_sessions,
  public.quiz_questions,
  public.ai_jobs,
  public.event_logs,
  public.audit_logs,
  public.sync_outbox
from anon, authenticated;

comment on table public.student_experiment_profiles is '学生八步文字实验的会话级目标基因与克隆设计快照';
