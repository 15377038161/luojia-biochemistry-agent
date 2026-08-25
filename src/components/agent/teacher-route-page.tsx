import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import TeacherAgent from '@/components/agent/teacher-agent';
import { getSessionUser } from '@/lib/supabase-auth';

export default async function TeacherRoutePage({ preview = false }: { preview?: boolean }) {
  if (preview) {
    if (process.env.ENABLE_UI_PREVIEW !== 'true') notFound();
    return <TeacherAgent displayName="陈思盈老师" demo preview />;
  }

  const session = await getSessionUser(await cookies());
  if (!session) redirect('/login');
  if (!session.user.capabilities.teacherWorkspace) redirect('/student/map');
  return <TeacherAgent displayName={session.user.profile.displayName} demo={session.user.provider === 'demo'} />;
}
