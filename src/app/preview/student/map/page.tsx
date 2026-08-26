import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function PreviewStudentMapPage() {
  if (process.env.ENABLE_UI_PREVIEW !== 'true') notFound();
  redirect('/student/map?preview=1');
}
