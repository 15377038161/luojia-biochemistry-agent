-- 关闭 profiles 的自助更新入口：角色与学号只能由服务端 admin 写入。
--
-- 原 profiles_self_update 策略只校验行归属、不限列，任何登录用户都能把自己的
-- role 改成 teacher、把 student_no 改成他人学号（学号用于超星成绩回传归属）。
-- 全仓写 profiles 的只有 supabase-chaoxing-user.ts 与 demo-auth.ts 两处，均走
-- service_role admin 客户端（绕过 RLS），删除该策略不影响任何合法写入。
drop policy if exists profiles_self_update on public.profiles;
