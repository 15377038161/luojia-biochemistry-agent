import TeacherRoutePage from '@/components/agent/teacher-route-page';

export default async function TeacherStudentDetailPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ preview?: string }> }) {
  const sessionId = (await params).sessionId;
  return <TeacherRoutePage preview={(await searchParams).preview === '1'} view="student-detail" studentSessionId={sessionId} />;
}
