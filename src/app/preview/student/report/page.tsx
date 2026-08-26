import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function PreviewStudentReportPage() {
  if (process.env.ENABLE_UI_PREVIEW !== 'true') notFound();
  redirect('/student/report?preview=1');
}
