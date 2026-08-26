import { notFound, redirect } from 'next/navigation';

export default async function PreviewStudentStepPage({ params }: { params: Promise<{ stepId: string }> }) {
  const stepId = Number((await params).stepId);
  if (!Number.isInteger(stepId) || stepId < 1 || stepId > 8) notFound();
  if (process.env.ENABLE_UI_PREVIEW !== 'true') notFound();
  redirect(`/student/step/${stepId}?preview=1`);
}
