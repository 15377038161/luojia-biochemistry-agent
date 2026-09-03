-- quiz_* 已收回 anon/authenticated 表权限，统一由完成身份校验的服务端 API 访问。
-- 删除不会再生效的直连策略，避免形成两套访问路径。
drop policy if exists quiz_sessions_own_read on public.quiz_sessions;
drop policy if exists quiz_sessions_own_insert on public.quiz_sessions;
drop policy if exists quiz_sessions_own_update on public.quiz_sessions;
