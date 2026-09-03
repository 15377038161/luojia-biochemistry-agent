-- 题目与正确答案仅由完成身份校验的服务端 API 读取，禁止浏览器直连 Data API。
alter table public.quiz_questions enable row level security;

revoke all on table public.quiz_questions from anon, authenticated;
revoke all on table public.quiz_sessions from anon, authenticated;

-- 即使未来重新授予 quiz_sessions 的 UPDATE，也必须同时校验更新后的归属字段。
drop policy if exists quiz_sessions_own_update on public.quiz_sessions;
create policy quiz_sessions_own_update on public.quiz_sessions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
