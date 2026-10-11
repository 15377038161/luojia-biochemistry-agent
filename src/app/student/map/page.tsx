import StudentRoutePage from '@/components/agent/student-route-page';

export default async function StudentMapPage({ searchParams }: { searchParams: Promise<{ preview?: string; practice?: string }> }) {
  const params = await searchParams;
  const preview = params.preview === '1';
  // practice=1 为教师体验隔离入口（agent_role='teacher' 会话，不写正式学生数据）
  const practice = params.practice === '1';
  return <StudentRoutePage preview={preview} practiceMode={practice} />;
}
