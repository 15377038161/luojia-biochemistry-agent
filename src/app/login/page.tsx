import type { Metadata } from 'next'
import LoginForm from '@/components/login-form'
import '../login.css'

export const metadata: Metadata = {
  title: '登录 | 超星学习通',
  description: '使用学习通身份登录珞珈生化智能体，无需注册账号。',
}

export default function LoginPage() {
  return <LoginForm />
}