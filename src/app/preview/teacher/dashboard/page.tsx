import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function PreviewTeacherDashboardPage() {
  if (process.env.ENABLE_UI_PREVIEW !== 'true') notFound();
  redirect('/teacher/dashboard?preview=1');
}
