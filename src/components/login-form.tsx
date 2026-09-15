'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { loginWithChaoxingOAuth, POST_LOGIN_HOME } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import BrandLockup from '@/components/brand-lockup'

/**
 * 超星 OAuth 一键登录表单：登录页 /login 的核心交互组件。
 * - 挂载时 session 自愈：检测到已有 session 即导航 POST_LOGIN_HOME（已登录再访登录页）。
 * - 点击「超星一键登录」→ loginWithChaoxingOAuth() 顶层跳转超星授权页。
 * - OAuth 回跳/中转闭环由根 layout 的 AuthCallback 统一处理，本组件不重复编排。
 */
export default function LoginForm() {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState('')

  // session 自愈：登录页不应停留于已登录状态
  useEffect(() => {
    getSupabase()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (session) router.replace(POST_LOGIN_HOME)
      })
      .catch(() => {
        /* 网络/配置异常时忽略，停留在登录页 */
      })
  }, [router])

  const handleLogin = async () => {
    if (isPending) return
    setIsPending(true)
    setError('')
    const result = await loginWithChaoxingOAuth()
    if (!result.success) {
      setIsPending(false)
      setError(result.error || '跳转授权页失败，请稍后重试')
    }
    // 成功时保持 pending，页面将整页跳转到超星
  }

  return (
    <div className="login-form-wrap">
      <div className="login-form-brand">
        <BrandLockup showChaoxing />
      </div>
      <div className="login-form-card">
        <p className="login-form-kicker">珞珈生化智能体 · 超星学习通登录</p>
        <h1 className="login-form-title">欢迎使用</h1>
        <p className="login-form-desc">使用学习通身份进入 EGFP 八步文字实验，无需注册账号。</p>

        {error && <p className="login-form-error" role="alert">{error}</p>}

        <button type="button" className="login-oauth-button" disabled={isPending} onClick={handleLogin}>
          <Image src="/brand/xuexitong-icon.jpg" alt="" width={24} height={24} className="login-oauth-icon" />
          {isPending ? '正在连接学习通…' : '超星一键登录'}
        </button>

        <p className="login-form-footnote">授权后由平台安全代理完成身份确认与登录。</p>
      </div>
    </div>
  )
}