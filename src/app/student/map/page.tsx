import StudentRoutePage from '@/components/agent/student-route-page';

export default async function StudentMapPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === '1';
  return <StudentRoutePage preview={preview} />;
}
