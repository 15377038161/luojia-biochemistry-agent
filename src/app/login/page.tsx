import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: '学习通登录',
  description: '使用学习通身份进入珞珈生化智能体',
};

export default async function LoginPage() {
  redirect('/');
}
