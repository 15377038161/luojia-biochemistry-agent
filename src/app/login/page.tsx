import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LoginExperience from '@/components/login-experience';
import { getChaoxingLoginOptions } from '@/lib/chaoxing-client';
import { getSessionUser } from '@/lib/supabase-auth';

export const metadata: Metadata = {
  title: '学习通登录',
  description: '使用学习通身份进入珞珈生化智能体',
};

export default async function LoginPage() {
  const session = await getSessionUser(await cookies());
  if (session) redirect(session.user.defaultWorkspace === 'teacher' ? '/teacher/dashboard' : '/student/map');

  return (
    <LoginExperience
      demo={process.env.ENABLE_UI_PREVIEW === 'true' || process.env.ENABLE_DEMO_ACCESS === 'true'}
      options={getChaoxingLoginOptions()}
    />
  );
}
