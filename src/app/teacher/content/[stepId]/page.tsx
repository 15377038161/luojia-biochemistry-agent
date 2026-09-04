import { notFound } from 'next/navigation';
import TeacherRoutePage from '@/components/agent/teacher-route-page';

export default async function TeacherContentStepPage({ params, searchParams }: { params: Promise<{ stepId: string }>; searchParams: Promise<{ preview?: string }> }) {
  const stepId = Number((await params).stepId);
  if (!Number.isInteger(stepId) || stepId < 1 || stepId > 8) notFound();
  return <TeacherRoutePage preview={(await searchParams).preview === '1'} view="content-detail" contentStep={stepId} />;
}
