import { notFound } from 'next/navigation';
import StudentRoutePage from '@/components/agent/student-route-page';

export default async function PreviewStudentStepPage({ params }: { params: Promise<{ stepId: string }> }) {
  const stepId = Number((await params).stepId);
  if (!Number.isInteger(stepId) || stepId < 1 || stepId > 8) notFound();
  return <StudentRoutePage preview stepId={stepId} />;
}
