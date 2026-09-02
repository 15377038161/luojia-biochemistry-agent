import TeacherRoutePage from '@/components/agent/teacher-route-page';

export default async function TeacherStudentsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === '1';
  return <TeacherRoutePage preview={preview} view="students" />;
}
