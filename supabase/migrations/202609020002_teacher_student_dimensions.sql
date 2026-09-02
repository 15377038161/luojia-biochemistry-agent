alter table public.profiles
  add column if not exists major_name text,
  add column if not exists grade_name text,
  add column if not exists class_name text,
  add column if not exists academic_source text;

comment on column public.profiles.major_name is '学习通身份或课程成员数据中的专业名称';
comment on column public.profiles.grade_name is '学习通身份或课程成员数据中的年级';
comment on column public.profiles.class_name is '学习通身份或课程成员数据中的行政班名称';
comment on column public.profiles.academic_source is '学籍维度来源，例如 chaoxing_identity 或 enrollment';

-- 历史账号至少可从现有选课关系恢复班级；专业和年级缺少可信来源时保持为空。
update public.profiles p
set class_name = c.name,
    academic_source = coalesce(p.academic_source, 'enrollment')
from public.enrollments e
join public.classes c on c.id = e.class_id
where e.user_id = p.id
  and e.role = 'student'
  and p.class_name is null;

create index if not exists profiles_academic_dimensions_idx
  on public.profiles(major_name, grade_name, class_name)
  where role = 'student';
