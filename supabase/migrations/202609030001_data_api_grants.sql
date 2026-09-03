-- Supabase 2026 新项目默认不再把 SQL 新建表自动暴露给 Data API。
-- 这里只授予应用现有浏览器/用户会话实际需要的表权限；行级范围继续由 RLS 控制。

revoke all on all tables in schema public from anon;

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

-- 这些表只允许服务端 service-role 访问，保持 Data API 用户角色不可见。
revoke all on table
  public.ai_jobs,
  public.event_logs,
  public.audit_logs,
  public.sync_outbox
from anon, authenticated;

grant select, insert on table storage.objects to authenticated;

