-- 武汉大学生物化学文字实验智能体 V2：统一身份、教师体验、内容版本与过程成绩。

create type public.session_mode as enum ('student', 'teacher_practice');
create type public.grade_status as enum ('provisional', 'review_required', 'appealed', 'final');

alter table public.agent_sessions
  add column session_mode public.session_mode not null default 'student',
  add column content_version_id uuid references public.content_versions(id) on delete restrict;

drop index if exists public.one_active_student_session_idx;
create unique index one_active_student_session_idx
  on public.agent_sessions(user_id, experiment_id, session_mode)
  where agent_role = 'student' and completed_at is null;
create index agent_sessions_mode_idx on public.agent_sessions(session_mode, class_id, completed_at);

create table public.teacher_role_grants (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'chaoxing',
  fid text not null,
  external_role_id text not null,
  label text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(provider, fid, external_role_id)
);

create table public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  version integer not null check (version > 0),
  payload jsonb not null,
  source_refs jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  published_content_version_id uuid references public.content_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(experiment_id, version)
);

create table public.grade_components (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.agent_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete restrict,
  process_score numeric(5,2) not null check (process_score between 0 and 100),
  contribution_points numeric(4,2) not null check (contribution_points between 0 and 10),
  status public.grade_status not null default 'provisional',
  teacher_override_score numeric(5,2) check (teacher_override_score between 0 and 100),
  finalized_by uuid references public.profiles(id) on delete set null,
  finalized_at timestamptz,
  calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index grade_components_class_idx on public.grade_components(class_id, status, process_score);

create table public.grade_review_requests (
  id uuid primary key default gen_random_uuid(),
  grade_component_id uuid not null references public.grade_components(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'rejected')),
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
-- 每个过程成绩仅允许学生发起一次异议，处理完成后也不能重复提交。
create unique index grade_review_one_per_grade_idx
  on public.grade_review_requests(grade_component_id);

alter table public.teacher_role_grants enable row level security;
alter table public.content_drafts enable row level security;
alter table public.grade_components enable row level security;
alter table public.grade_review_requests enable row level security;

create policy content_drafts_teacher_read on public.content_drafts for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher', 'content_admin'))
);
create policy content_drafts_teacher_insert on public.content_drafts for insert to authenticated with check (
  created_by = auth.uid() and updated_by = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher', 'content_admin'))
);
create policy content_drafts_teacher_update on public.content_drafts for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher', 'content_admin'))
) with check (
  updated_by = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher', 'content_admin'))
);

-- 学生只能读取自己会话在开始时固定绑定的发布版本，避免内容发布后改变历史证据。
create policy content_versions_session_read on public.content_versions for select to authenticated using (
  exists (
    select 1 from public.agent_sessions s
    where s.user_id = auth.uid() and s.content_version_id = content_versions.id
  )
);

create policy grade_component_owner_read on public.grade_components for select to authenticated using (
  user_id = auth.uid() or public.is_authorized_teacher(class_id)
);
create policy grade_review_owner_read on public.grade_review_requests for select to authenticated using (
  requester_id = auth.uid() or exists (
    select 1 from public.grade_components g where g.id = grade_component_id and public.is_authorized_teacher(g.class_id)
  )
);

revoke all on public.teacher_role_grants from anon, authenticated;

create or replace function public.pin_latest_content_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.content_version_id is null and new.experiment_id is not null then
    select cv.id into new.content_version_id
    from public.content_versions cv
    where cv.experiment_id = new.experiment_id and cv.published_at is not null
    order by cv.version desc limit 1;
  end if;
  return new;
end;
$$;
create trigger pin_agent_session_content_version
before insert on public.agent_sessions
for each row execute function public.pin_latest_content_version();

create or replace function public.start_or_resume_teacher_practice_session()
returns public.agent_sessions
language plpgsql security definer set search_path = public as $$
declare
  result public.agent_sessions;
  viewer uuid := auth.uid();
  step_no integer;
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id = viewer and role in ('teacher', 'content_admin')) then
    raise exception 'FORBIDDEN';
  end if;

  select * into result from public.agent_sessions
  where user_id = viewer
    and experiment_id = '10000000-0000-4000-8000-000000000003'
    and agent_role = 'student'
    and session_mode = 'teacher_practice'
    and completed_at is null
  order by created_at desc limit 1;

  if result.id is null then
    insert into public.agent_sessions(user_id, experiment_id, class_id, agent_role, session_mode, current_step)
    values (viewer, '10000000-0000-4000-8000-000000000003', null, 'student', 'teacher_practice', 1)
    returning * into result;

    for step_no in 1..8 loop
      insert into public.step_states(session_id, step_no, status)
      values (result.id, step_no, case when step_no = 1 then 'active'::public.step_status else 'locked'::public.step_status end);
    end loop;

    insert into public.agent_messages(session_id, role, kind, step_no, content, metadata)
    values (result.id, 'assistant', 'navigation', 1,
      '已进入教师独立学习体验。这里的文字推演、评阅和报告不会计入班级统计、课程成绩或超星同步。',
      jsonb_build_object('sessionMode', 'teacher_practice'));
  end if;
  return result;
end;
$$;
grant execute on function public.start_or_resume_teacher_practice_session() to authenticated;

-- 防止教师体验记录进入超星 outbox，即使业务接口误调用也由数据库兜底。
create or replace function public.suppress_practice_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mode_value public.session_mode;
begin
  if new.aggregate_type = 'step_evaluation' then
    select s.session_mode into mode_value
    from public.evaluations e
    join public.step_attempts a on a.id = e.attempt_id
    join public.agent_sessions s on s.id = a.session_id
    where e.id = new.aggregate_id;
  elsif new.aggregate_type = 'learning_report' then
    select s.session_mode into mode_value
    from public.learning_reports r
    join public.agent_sessions s on s.id = r.session_id
    where r.id = new.aggregate_id;
  end if;
  if mode_value = 'teacher_practice' then return null; end if;
  return new;
end;
$$;
create trigger suppress_teacher_practice_sync
before insert on public.sync_outbox
for each row execute function public.suppress_practice_sync();

create or replace function public.refresh_grade_component(target_session uuid)
returns public.grade_components
language plpgsql security definer set search_path = public as $$
declare
  viewer uuid := auth.uid();
  session_row public.agent_sessions;
  calculated numeric(5,2);
  result public.grade_components;
  needs_review boolean;
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into session_row from public.agent_sessions where id = target_session;
  if session_row.id is null then raise exception 'RESOURCE_MISSING'; end if;
  if session_row.session_mode <> 'student' then raise exception 'PRACTICE_NOT_GRADED'; end if;
  if session_row.user_id <> viewer and not public.is_authorized_teacher(session_row.class_id) then raise exception 'FORBIDDEN'; end if;

  with latest as (
    select distinct on (a.step_no) a.step_no, e.total_score
    from public.step_attempts a join public.evaluations e on e.attempt_id = a.id
    where a.session_id = target_session
    order by a.step_no, a.version_no desc
  )
  select round(coalesce(sum(latest.total_score), 0)::numeric / 8, 2) into calculated from latest;

  select calculated < 60 or exists (
    select 1 from public.step_states where session_id = target_session and status = 'teacher_review'
  ) into needs_review;

  insert into public.grade_components(session_id, user_id, class_id, process_score, contribution_points, status)
  values (target_session, session_row.user_id, session_row.class_id, calculated, round(calculated * .1, 2),
    case when needs_review then 'review_required'::public.grade_status else 'provisional'::public.grade_status end)
  on conflict (session_id) do update set
    process_score = excluded.process_score,
    contribution_points = excluded.contribution_points,
    status = case when public.grade_components.status in ('appealed', 'final') then public.grade_components.status else excluded.status end,
    calculated_at = now(), updated_at = now()
  returning * into result;
  return result;
end;
$$;
grant execute on function public.refresh_grade_component(uuid) to authenticated;

create or replace function public.submit_grade_review(target_grade uuid, review_reason text)
returns public.grade_review_requests
language plpgsql security definer set search_path = public as $$
declare
  viewer uuid := auth.uid();
  grade_row public.grade_components;
  result public.grade_review_requests;
begin
  if viewer is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(trim(review_reason)) < 10 then raise exception 'VALIDATION_ERROR'; end if;
  select * into grade_row from public.grade_components where id = target_grade for update;
  if grade_row.user_id <> viewer then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.grade_review_requests where grade_component_id = target_grade) then
    raise exception 'STATE_INVALID';
  end if;
  insert into public.grade_review_requests(grade_component_id, requester_id, reason)
  values (target_grade, viewer, trim(review_reason)) returning * into result;
  update public.grade_components set status = 'appealed', updated_at = now() where id = target_grade;
  return result;
end;
$$;
grant execute on function public.submit_grade_review(uuid, text) to authenticated;

create or replace function public.resolve_grade_review(
  target_request uuid,
  resolution_text text,
  override_score numeric default null,
  accepted boolean default true
)
returns public.grade_review_requests
language plpgsql security definer set search_path = public as $$
declare
  viewer uuid := auth.uid();
  result public.grade_review_requests;
  grade_row public.grade_components;
  final_score numeric(5,2);
  event_key uuid := gen_random_uuid();
begin
  select g.* into grade_row from public.grade_review_requests r
  join public.grade_components g on g.id = r.grade_component_id
  where r.id = target_request for update;
  if grade_row.id is null or not public.is_authorized_teacher(grade_row.class_id) then raise exception 'FORBIDDEN'; end if;
  if override_score is not null and (override_score < 0 or override_score > 100) then raise exception 'VALIDATION_ERROR'; end if;
  final_score := coalesce(override_score, grade_row.process_score);
  update public.grade_review_requests set
    status = case when accepted then 'resolved' else 'rejected' end,
    resolution = trim(resolution_text), resolved_by = viewer, resolved_at = now()
  where id = target_request and status = 'pending' returning * into result;
  if result.id is null then raise exception 'STATE_INVALID'; end if;
  update public.grade_components set process_score = final_score,
    contribution_points = round(final_score * .1, 2), teacher_override_score = override_score,
    status = 'final', finalized_by = viewer, finalized_at = now(), updated_at = now()
  where id = grade_row.id;
  insert into public.sync_outbox(event_id, aggregate_type, aggregate_id, payload)
  values (event_key, 'grade_finalized', grade_row.id, jsonb_build_object(
    'student_id', grade_row.user_id::text,
    'total_score', final_score,
    'course_contribution', round(final_score * .1, 2),
    'teacher_comment', trim(resolution_text)
  ));
  return result;
end;
$$;
grant execute on function public.resolve_grade_review(uuid, text, numeric, boolean) to authenticated;

-- 允许教师通过正式接口管理内容版本，客户端仍受 RLS 约束。
create policy content_versions_teacher_insert on public.content_versions for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher', 'content_admin'))
);
create policy content_versions_teacher_update on public.content_versions for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher', 'content_admin'))
);

create policy course_assets_teacher_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'course-assets'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher', 'content_admin'))
);
