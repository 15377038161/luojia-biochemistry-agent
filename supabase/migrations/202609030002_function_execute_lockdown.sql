-- PostgreSQL 默认把新函数的 EXECUTE 授予 PUBLIC；在 Supabase 中这会让 anon
-- 也能通过 RPC 调用 SECURITY DEFINER 函数。先收回默认权限，再只开放给登录用户。

revoke execute on function public.is_authorized_teacher(uuid) from public, anon;
revoke execute on function public.start_or_resume_student_session() from public, anon;
revoke execute on function public.record_text_evaluation(uuid, smallint, uuid, text, jsonb, text, text) from public, anon;
revoke execute on function public.record_learning_report(uuid, jsonb, text, text) from public, anon;
revoke execute on function public.record_teacher_review(uuid, text, text) from public, anon;

grant execute on function public.is_authorized_teacher(uuid) to authenticated;
grant execute on function public.start_or_resume_student_session() to authenticated;
grant execute on function public.record_text_evaluation(uuid, smallint, uuid, text, jsonb, text, text) to authenticated;
grant execute on function public.record_learning_report(uuid, jsonb, text, text) to authenticated;
grant execute on function public.record_teacher_review(uuid, text, text) to authenticated;

revoke all on table public.external_identities from anon, authenticated;

