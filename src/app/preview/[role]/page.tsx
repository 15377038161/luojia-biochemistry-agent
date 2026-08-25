import { notFound, redirect } from 'next/navigation';

export default async function PreviewPage({ params }: { params: Promise<{ role: string }> }) {
  if (process.env.ENABLE_UI_PREVIEW !== 'true') notFound();
  const { role } = await params;
  if (role === 'student') redirect('/preview/student/map');
  if (role === 'teacher') redirect('/preview/teacher/dashboard');
  notFound();
}
