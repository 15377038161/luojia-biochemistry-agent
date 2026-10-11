import StudentRoutePage from '@/components/agent/student-route-page';

export default async function StudentReportPage({ searchParams }: { searchParams: Promise<{ preview?: string; practice?: string }> }) {
  const sp = await searchParams;
  const preview = sp.preview === '1';
  const practice = sp.practice === '1';
  return <StudentRoutePage preview={preview} practiceMode={practice} reportPage />;
}
