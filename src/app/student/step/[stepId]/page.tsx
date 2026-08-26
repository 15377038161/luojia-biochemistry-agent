import { notFound } from 'next/navigation';
import StudentRoutePage from '@/components/agent/student-route-page';

export default async function StudentStepPage({ params, searchParams }: { params: Promise<{ stepId: string }>; searchParams: Promise<{ preview?: string }> }) {
  const stepId = Number((await params).stepId);
  if (!Number.isInteger(stepId) || stepId < 1 || stepId > 8) notFound();
  const preview = (await searchParams).preview === '1';
  return <StudentRoutePage preview={preview} stepId={stepId} />;
}
