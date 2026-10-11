import { notFound } from 'next/navigation';
import StudentRoutePage from '@/components/agent/student-route-page';

export default async function StudentStepPage({ params, searchParams }: { params: Promise<{ stepId: string }>; searchParams: Promise<{ preview?: string; practice?: string }> }) {
  const stepId = Number((await params).stepId);
  if (!Number.isInteger(stepId) || stepId < 1 || stepId > 8) notFound();
  const sp = await searchParams;
  const preview = sp.preview === '1';
  const practice = sp.practice === '1';
  return <StudentRoutePage preview={preview} practiceMode={practice} stepId={stepId} />;
}
