import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import StudentAgent from '@/components/agent/student-agent';
import { getSessionUser } from '@/lib/supabase-auth';

interface Props {
  preview?: boolean;
  stepId?: number;
  reportPage?: boolean;
}

export default async function StudentRoutePage({ preview = false, stepId, reportPage = false }: Props) {
  if (preview) {
    if (process.env.ENABLE_UI_PREVIEW !== 'true') notFound();
    return <StudentAgent displayName="陈同学" demo preview routeBase="/preview/student" initialStep={stepId} reportPage={reportPage} />;
  }

  const session = await getSessionUser(await cookies());
  if (!session) redirect('/login');
  if (!session.user.capabilities.studentWorkspace) redirect('/auth/error?reason=forbidden');
  return <StudentAgent displayName={session.user.profile.displayName} demo={session.user.provider === 'demo'} practiceMode={session.user.capabilities.teacherPractice} routeBase="/student" initialStep={stepId} reportPage={reportPage} />;
}
