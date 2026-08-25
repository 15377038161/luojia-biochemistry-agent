create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'teacher', 'content_admin');
create type public.agent_role as enum ('student', 'teacher');
create type public.message_role as enum ('user', 'assistant', 'system');
create type public.step_status as enum ('locked', 'active', 'passed', 'teacher_review');
create type public.evaluation_decision as enum ('pass', 'revise', 'teacher_review');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.app_role not null default 'student',
  student_no text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.external_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  external_uid text not null,
  fid text,
  raw_roles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider, external_uid, fid)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,
  term text,
  created_at timestamptz not null default now(),
  unique(course_id, name, term)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique(class_id, user_id)
);

create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  slug text not null,
  title text not null,
  version integer not null default 1 check (version > 0),
  status text not null default 'published' check (status in ('draft', 'published', 'inactive')),
  source_hash text,
  created_at timestamptz not null default now(),
  unique(course_id, slug, version)
);

create table public.experiment_steps (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  step_no smallint not null check (step_no between 1 and 8),
  slug text not null,
  title text not null,
  context text not null,
  goal text not null,
  content jsonb not null,
  source_ref text not null,
  created_at timestamptz not null default now(),
  unique(experiment_id, step_no)
);

create table public.rubrics (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.experiment_steps(id) on delete cascade,
  version integer not null default 1,
  pass_score smallint not null default 80 check (pass_score between 0 and 100),
  status text not null default 'published' check (status in ('draft', 'published', 'inactive')),
  source_ref text not null,
  unique(step_id, version)
);

create table public.rubric_items (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.rubrics(id) on delete cascade,
  code text not null,
  dimension text not null check (dimension in ('knowledge', 'operation', 'decision', 'troubleshooting', 'analysis')),
  label text not null,
  weight smallint not null check (weight between 1 and 100),
  required_points jsonb not null default '[]'::jsonb,
  accepted_phrases jsonb not null default '[]'::jsonb,
  gates jsonb not null default '[]'::jsonb,
  hints jsonb not null default '[]'::jsonb,
  unique(rubric_id, code)
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  step_no smallint check (step_no between 1 and 8),
  kind text not null,
  title text not null,
  content text not null,
  structured_data jsonb not null default '{}'::jsonb,
  source_file text not null,
  source_location text,
  source_hash text not null,
  version integer not null default 1,
  teacher_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);
create index knowledge_chunks_step_idx on public.knowledge_chunks(experiment_id, step_no, kind);

create table public.instrument_catalog (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  name text not null,
  aliases jsonb not null default '[]'::jsonb,
  purpose text not null,
  safety_points jsonb not null default '[]'::jsonb,
  applicable_steps jsonb not null default '[]'::jsonb,
  image_path text,
  source_ref text not null,
  unique(experiment_id, name)
);

create table public.image_questions (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  step_no smallint not null check (step_no between 1 and 8),
  prompt text not null,
  image_path text not null,
  labels jsonb not null,
  safety_critical boolean not null default false,
  source_ref text not null,
  active boolean not null default true
);

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  version integer not null,
  manifest jsonb not null,
  source_hash text not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(experiment_id, version)
);

create table public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  experiment_id uuid references public.experiments(id) on delete restrict,
  class_id uuid references public.classes(id) on delete restrict,
  agent_role public.agent_role not null,
  current_step smallint check (current_step between 1 and 8),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_student_session_idx on public.agent_sessions(user_id, experiment_id)
  where agent_role = 'student' and completed_at is null;
create index agent_sessions_class_idx on public.agent_sessions(class_id, agent_role, current_step);

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  role public.message_role not null,
  kind text not null,
  step_no smallint check (step_no between 1 and 8),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index agent_messages_session_idx on public.agent_messages(session_id, created_at);

create table public.step_states (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  step_no smallint not null check (step_no between 1 and 8),
  status public.step_status not null,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 100),
  final_summary text,
  passed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(session_id, step_no)
);

create table public.step_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  step_no smallint not null check (step_no between 1 and 8),
  version_no smallint not null check (version_no > 0),
  request_id uuid not null unique,
  answer text not null,
  submitted_at timestamptz not null default now(),
  unique(session_id, step_no, version_no)
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.step_attempts(id) on delete cascade,
  decision public.evaluation_decision not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  total_score smallint not null check (total_score between 0 and 100),
  result jsonb not null,
  prompt_version text not null,
  workflow_run_id text,
  requires_teacher_review boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.media_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  step_no smallint not null check (step_no between 1 and 8),
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null,
  evaluation jsonb,
  created_at timestamptz not null default now(),
  unique(session_id, sha256)
);

create table public.learning_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  version integer not null default 1,
  content jsonb not null,
  rendered_markdown text not null,
  workflow_run_id text,
  created_at timestamptz not null default now(),
  unique(session_id, version)
);

create table public.teacher_reviews (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid references public.evaluations(id) on delete cascade,
  report_id uuid references public.learning_reports(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  decision text check (decision in ('confirm', 'adjust', 'comment_only')),
  comment text,
  created_at timestamptz not null default now(),
  check (evaluation_id is not null or report_id is not null)
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  kind text not null check (kind in ('text', 'vision', 'report')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.event_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  request_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

create table public.sync_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  aggregate_type text not null,
  aggregate_id uuid not null,
  destination text not null default 'chaoxing_form_3513491',
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'manual')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sync_outbox_worker_idx on public.sync_outbox(status, next_attempt_at);

create or replace function public.is_authorized_teacher(target_class uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.enrollments e
    where e.class_id = target_class and e.user_id = auth.uid()
      and e.role in ('teacher', 'content_admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.external_identities enable row level security;
alter table public.courses enable row level security;
alter table public.classes enable row level security;
alter table public.enrollments enable row level security;
alter table public.experiments enable row level security;
alter table public.experiment_steps enable row level security;
alter table public.rubrics enable row level security;
alter table public.rubric_items enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.instrument_catalog enable row level security;
alter table public.image_questions enable row level security;
alter table public.content_versions enable row level security;
alter table public.agent_sessions enable row level security;
alter table public.agent_messages enable row level security;
alter table public.step_states enable row level security;
alter table public.step_attempts enable row level security;
alter table public.evaluations enable row level security;
alter table public.media_submissions enable row level security;
alter table public.learning_reports enable row level security;
alter table public.teacher_reviews enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.event_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.sync_outbox enable row level security;

create policy profiles_self_read on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_teacher_read on public.profiles for select using (
  exists(select 1 from public.enrollments target
    join public.enrollments viewer on viewer.class_id = target.class_id
    where target.user_id = profiles.id and viewer.user_id = auth.uid()
      and viewer.role in ('teacher', 'content_admin'))
);
create policy course_authenticated_read on public.courses for select to authenticated using (active);
create policy class_enrolled_read on public.classes for select to authenticated using (
  exists(select 1 from public.enrollments e where e.class_id = classes.id and e.user_id = auth.uid())
);
create policy enrollment_self_or_teacher_read on public.enrollments for select to authenticated using (
  user_id = auth.uid() or public.is_authorized_teacher(class_id)
);

create policy experiment_enrolled_read on public.experiments for select to authenticated using (
  exists(select 1 from public.classes c join public.enrollments e on e.class_id = c.id
    where c.course_id = experiments.course_id and e.user_id = auth.uid())
);
create policy step_enrolled_read on public.experiment_steps for select to authenticated using (
  exists(select 1 from public.experiments x join public.classes c on c.course_id = x.course_id
    join public.enrollments e on e.class_id = c.id
    where x.id = experiment_steps.experiment_id and e.user_id = auth.uid())
);
create policy rubric_enrolled_read on public.rubrics for select to authenticated using (
  exists(select 1 from public.experiment_steps s join public.experiments x on x.id = s.experiment_id
    join public.classes c on c.course_id = x.course_id
    where s.id = rubrics.step_id and public.is_authorized_teacher(c.id))
);
create policy rubric_item_enrolled_read on public.rubric_items for select to authenticated using (
  exists(select 1 from public.rubrics r join public.experiment_steps s on s.id = r.step_id
    join public.experiments x on x.id = s.experiment_id join public.classes c on c.course_id = x.course_id
    where r.id = rubric_items.rubric_id and public.is_authorized_teacher(c.id))
);
create policy knowledge_enrolled_read on public.knowledge_chunks for select to authenticated using (
  exists(select 1 from public.experiments x join public.classes c on c.course_id = x.course_id
    where x.id = knowledge_chunks.experiment_id and public.is_authorized_teacher(c.id))
);
create policy instrument_enrolled_read on public.instrument_catalog for select to authenticated using (
  exists(select 1 from public.experiments x join public.classes c on c.course_id = x.course_id
    join public.enrollments e on e.class_id = c.id where x.id = instrument_catalog.experiment_id and e.user_id = auth.uid())
);
create policy image_question_enrolled_read on public.image_questions for select to authenticated using (
  exists(select 1 from public.experiments x join public.classes c on c.course_id = x.course_id
    join public.enrollments e on e.class_id = c.id where x.id = image_questions.experiment_id and e.user_id = auth.uid())
);
create policy content_versions_teacher_read on public.content_versions for select to authenticated using (
  exists(select 1 from public.experiments x join public.classes c on c.course_id = x.course_id
    where x.id = content_versions.experiment_id and public.is_authorized_teacher(c.id))
);

create policy session_owner_read on public.agent_sessions for select using (
  user_id = auth.uid() or public.is_authorized_teacher(class_id)
);
create policy session_owner_insert on public.agent_sessions for insert with check (user_id = auth.uid());
create policy session_owner_update on public.agent_sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy message_session_access on public.agent_messages for select using (
  exists(select 1 from public.agent_sessions s where s.id = agent_messages.session_id
    and (s.user_id = auth.uid() or public.is_authorized_teacher(s.class_id)))
);
create policy message_owner_insert on public.agent_messages for insert with check (
  exists(select 1 from public.agent_sessions s where s.id = agent_messages.session_id and s.user_id = auth.uid())
);

create policy step_state_session_access on public.step_states for select using (
  exists(select 1 from public.agent_sessions s where s.id = step_states.session_id
    and (s.user_id = auth.uid() or public.is_authorized_teacher(s.class_id)))
);
create policy attempt_session_access on public.step_attempts for select using (
  exists(select 1 from public.agent_sessions s where s.id = step_attempts.session_id
    and (s.user_id = auth.uid() or public.is_authorized_teacher(s.class_id)))
);
create policy evaluation_session_access on public.evaluations for select using (
  exists(select 1 from public.step_attempts a join public.agent_sessions s on s.id = a.session_id
    where a.id = evaluations.attempt_id and (s.user_id = auth.uid() or public.is_authorized_teacher(s.class_id)))
);
create policy media_session_access on public.media_submissions for select using (
  exists(select 1 from public.agent_sessions s where s.id = media_submissions.session_id
    and (s.user_id = auth.uid() or public.is_authorized_teacher(s.class_id)))
);
create policy media_owner_insert on public.media_submissions for insert with check (
  exists(select 1 from public.agent_sessions s where s.id = media_submissions.session_id and s.user_id = auth.uid())
);
create policy report_session_access on public.learning_reports for select using (
  exists(select 1 from public.agent_sessions s where s.id = learning_reports.session_id
    and (s.user_id = auth.uid() or public.is_authorized_teacher(s.class_id)))
);
create policy report_owner_insert on public.learning_reports for insert with check (
  exists(select 1 from public.agent_sessions s where s.id = learning_reports.session_id and s.user_id = auth.uid())
);
create policy review_teacher_read on public.teacher_reviews for select using (
  teacher_id = auth.uid() or exists(
    select 1 from public.evaluations v join public.step_attempts a on a.id = v.attempt_id
    join public.agent_sessions s on s.id = a.session_id
    where v.id = teacher_reviews.evaluation_id and s.user_id = auth.uid()
  )
);
create policy review_teacher_insert on public.teacher_reviews for insert with check (
  teacher_id = auth.uid() and (
    evaluation_id is null or exists(
      select 1 from public.evaluations v join public.step_attempts a on a.id = v.attempt_id
      join public.agent_sessions s on s.id = a.session_id
      where v.id = teacher_reviews.evaluation_id and public.is_authorized_teacher(s.class_id)
    )
  )
);

-- 过程表的写入统一收敛到服务端事务/RPC；客户端只允许读取RLS授权的数据。
revoke all on public.ai_jobs, public.event_logs, public.audit_logs, public.sync_outbox from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('course-assets', 'course-assets', true, 10485760, array['image/jpeg','image/png','image/webp']),
  ('student-media', 'student-media', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy course_assets_authenticated_read on storage.objects for select to authenticated
using (bucket_id = 'course-assets');
create policy student_media_owner_read on storage.objects for select to authenticated
using (bucket_id = 'student-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy student_media_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'student-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- 第一版固定课程/班级/实验。正式接入教务数据时只替换班级与选课关系，不改变智能体业务表。
insert into public.courses(id, code, name)
values ('10000000-0000-4000-8000-000000000001', 'BIOCHEM-EGFP', '生物化学实验')
on conflict (id) do nothing;

insert into public.classes(id, course_id, name, term)
values ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '演示班级', '2026')
on conflict (id) do nothing;

insert into public.experiments(id, course_id, slug, title, version, status)
values ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'egfp-expression-purification', 'EGFP表达与纯化文字实验', 1, 'published')
on conflict (id) do nothing;

create or replace function public.start_or_resume_student_session()
returns public.agent_sessions
language plpgsql security definer set search_path = public
as $$
declare
  result public.agent_sessions;
  viewer uuid := auth.uid();
  step_no integer;
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;

  insert into public.profiles(id, display_name, role)
  values (viewer, coalesce(auth.jwt()->'user_metadata'->>'full_name', '学生'), 'student')
  on conflict (id) do nothing;

  insert into public.enrollments(class_id, user_id, role)
  values ('10000000-0000-4000-8000-000000000002', viewer, 'student')
  on conflict (class_id, user_id) do nothing;

  select * into result from public.agent_sessions
  where user_id = viewer and experiment_id = '10000000-0000-4000-8000-000000000003'
    and agent_role = 'student' and completed_at is null
  order by created_at desc limit 1;

  if result.id is null then
    insert into public.agent_sessions(user_id, experiment_id, class_id, agent_role, current_step)
    values (viewer, '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'student', 1)
    returning * into result;

    for step_no in 1..8 loop
      insert into public.step_states(session_id, step_no, status)
      values (result.id, step_no, case when step_no = 1 then 'active'::public.step_status else 'locked'::public.step_status end);
    end loop;

    insert into public.agent_messages(session_id, role, kind, step_no, content)
    values (result.id, 'assistant', 'navigation', 1,
      '欢迎来到EGFP表达与纯化文字实验。我会通过对话陪你走完八个步骤。先从目标基因与引物设计开始，请用自己的话说明你会怎样获取EGFP序列并设计引物。');
  end if;
  return result;
end;
$$;

create or replace function public.record_text_evaluation(
  target_session uuid,
  target_step smallint,
  request_key uuid,
  student_answer text,
  evaluation_result jsonb,
  prompt_version_value text,
  workflow_run_value text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  session_row public.agent_sessions;
  state_row public.step_states;
  new_attempt_id uuid;
  new_evaluation_id uuid;
  next_step smallint;
  decision_value public.evaluation_decision;
  score_value integer;
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into session_row from public.agent_sessions where id = target_session for update;
  if session_row.user_id is distinct from viewer then raise exception 'FORBIDDEN'; end if;
  if session_row.current_step is distinct from target_step then raise exception 'STATE_INVALID'; end if;
  select * into state_row from public.step_states where session_id = target_session and step_no = target_step for update;
  if state_row.status not in ('active', 'teacher_review') then raise exception 'STATE_INVALID'; end if;

  select a.id into new_attempt_id from public.step_attempts a where a.request_id = request_key;
  if new_attempt_id is not null then
    select e.id into new_evaluation_id from public.evaluations e where e.attempt_id = new_attempt_id;
    return new_evaluation_id;
  end if;

  decision_value := (evaluation_result->>'decision')::public.evaluation_decision;
  score_value := coalesce((evaluation_result->'scores'->>'knowledge')::integer, 0)
    + coalesce((evaluation_result->'scores'->>'operation')::integer, 0)
    + coalesce((evaluation_result->'scores'->>'decision')::integer, 0)
    + coalesce((evaluation_result->'scores'->>'troubleshooting')::integer, 0)
    + coalesce((evaluation_result->'scores'->>'analysis')::integer, 0);

  insert into public.step_attempts(session_id, step_no, version_no, request_id, answer)
  values (target_session, target_step, state_row.attempt_count + 1, request_key, student_answer)
  returning id into new_attempt_id;

  insert into public.evaluations(attempt_id, decision, confidence, total_score, result, prompt_version, workflow_run_id, requires_teacher_review)
  values (new_attempt_id, decision_value, (evaluation_result->>'confidence')::numeric, score_value,
    evaluation_result, prompt_version_value, workflow_run_value,
    coalesce((evaluation_result->>'requiresTeacherReview')::boolean, false))
  returning id into new_evaluation_id;

  insert into public.agent_messages(session_id, role, kind, step_no, content, metadata)
  values
    (target_session, 'user', 'step_answer', target_step, student_answer, jsonb_build_object('attemptId', new_attempt_id)),
    (target_session, 'assistant', 'feedback', target_step, evaluation_result->>'studentFeedback', jsonb_build_object('evaluationId', new_evaluation_id));

  if decision_value = 'pass' then
    update public.step_states set status = 'passed', attempt_count = attempt_count + 1,
      final_summary = evaluation_result->>'teacherSummary', passed_at = now(), updated_at = now()
    where id = state_row.id;
    if target_step < 8 then
      next_step := target_step + 1;
      update public.step_states set status = 'active', updated_at = now()
      where session_id = target_session and step_no = next_step;
      update public.agent_sessions set current_step = next_step, updated_at = now() where id = target_session;
    else
      update public.agent_sessions set completed_at = now(), updated_at = now() where id = target_session;
    end if;
  else
    update public.step_states set
      status = case when state_row.attempt_count + 1 >= 3 and coalesce(jsonb_array_length(evaluation_result->'safetyAlerts'), 0) = 0
        then 'teacher_review'::public.step_status else 'active'::public.step_status end,
      attempt_count = attempt_count + 1, updated_at = now()
    where id = state_row.id;
  end if;

  insert into public.sync_outbox(event_id, aggregate_type, aggregate_id, payload)
  values (request_key, 'step_evaluation', new_evaluation_id, jsonb_build_object(
    'student_id', viewer::text,
    'step_id', target_step,
    'version_no', state_row.attempt_count + 1,
    'student_answer', student_answer,
    'ai_feedback', evaluation_result->>'studentFeedback',
    'gate_status', decision_value::text,
    'total_score', score_value,
    'ai_confidence', evaluation_result->>'confidence'
  ));

  return new_evaluation_id;
end;
$$;

grant execute on function public.start_or_resume_student_session() to authenticated;
grant execute on function public.record_text_evaluation(uuid, smallint, uuid, text, jsonb, text, text) to authenticated;

create or replace function public.record_learning_report(
  target_session uuid,
  report_content jsonb,
  report_markdown text,
  workflow_run_value text default null
)
returns public.learning_reports
language plpgsql security definer set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  session_row public.agent_sessions;
  result public.learning_reports;
  next_version integer;
  event_key uuid := gen_random_uuid();
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into session_row from public.agent_sessions where id = target_session;
  if session_row.user_id is distinct from viewer then raise exception 'FORBIDDEN'; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.learning_reports where session_id = target_session;
  insert into public.learning_reports(session_id, version, content, rendered_markdown, workflow_run_id)
  values (target_session, next_version, report_content, report_markdown, workflow_run_value)
  returning * into result;
  insert into public.sync_outbox(event_id, aggregate_type, aggregate_id, payload)
  values (event_key, 'learning_report', result.id, jsonb_build_object(
    'student_id', viewer::text,
    'final_report', report_markdown
  ));
  return result;
end;
$$;

create or replace function public.record_teacher_review(
  target_evaluation uuid,
  review_decision text,
  review_comment text
)
returns public.teacher_reviews
language plpgsql security definer set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  target_class uuid;
  student_uid uuid;
  result public.teacher_reviews;
  event_key uuid := gen_random_uuid();
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;
  if review_decision not in ('confirm', 'adjust', 'comment_only') then raise exception 'VALIDATION_ERROR'; end if;
  select s.class_id, s.user_id into target_class, student_uid
  from public.evaluations e join public.step_attempts a on a.id = e.attempt_id
  join public.agent_sessions s on s.id = a.session_id where e.id = target_evaluation;
  if not public.is_authorized_teacher(target_class) then raise exception 'FORBIDDEN'; end if;
  insert into public.teacher_reviews(evaluation_id, teacher_id, decision, comment)
  values (target_evaluation, viewer, review_decision, review_comment) returning * into result;
  insert into public.sync_outbox(event_id, aggregate_type, aggregate_id, payload)
  values (event_key, 'teacher_review', result.id, jsonb_build_object(
    'student_id', student_uid::text,
    'teacher_comment', review_comment
  ));
  return result;
end;
$$;

grant execute on function public.record_learning_report(uuid, jsonb, text, text) to authenticated;
grant execute on function public.record_teacher_review(uuid, text, text) to authenticated;
