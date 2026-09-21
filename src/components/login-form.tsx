'use client'

import Image from 'next/image'
import { useState } from 'react'
import { loginWithChaoxingOAuth } from '@/lib/auth'
import BrandLockup from '@/components/brand-lockup'

/**
 * 超星 OAuth 一键登录表单：登录页 /login 的核心交互组件。
 * - 点击「超星一键登录」→ loginWithChaoxingOAuth() 顶层跳转超星授权页。
 * - 已登录用户访问 /login 的跳转由根 layout 的 AuthGuard 统一处理（唯一拦截点）。
 *
 * 视觉结构复用「珞珈山小实验家 · 科学探险手账」系统（login.css）：
 * shell（背景图 + 光晕）+ 动效层（气泡/光点/漂浮实验器具）+ nav + form 卡片 + footer。
 */
export default function LoginForm() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState('')

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
    <div className="login-page-shell">
      {/* 背景：生化实验水彩插画 + 柔和渐变光晕 */}
      <div className="login-page-art" aria-hidden>
        <span className="login-page-bg" />
        <span className="login-page-veil" />
      </div>

      {/* 动效层：上升气泡、漂浮光点、缓缓摆动的实验器具 */}
      <div className="login-page-motion" aria-hidden>
        <span className="login-bubble login-bubble-a" />
        <span className="login-bubble login-bubble-b" />
        <span className="login-bubble login-bubble-c" />
        <span className="login-bubble login-bubble-d" />
        <span className="login-bubble login-bubble-e" />
        <span className="login-spark login-spark-a" />
        <span className="login-spark login-spark-b" />
        <span className="login-spark login-spark-c" />
        <span className="login-spark login-spark-d" />
        <span className="login-sway login-sway-flask" />
        <span className="login-sway login-sway-helix" />
      </div>

      <header className="login-page-nav">
        <div className="login-page-brand">
          <BrandLockup decorative showChaoxing={false} />
          <div>
            <strong>珞珈生化智能体</strong>
            <small>WHU · BIOCHEM TEXT LAB</small>
          </div>
        </div>
        <span className="login-page-course">EGFP · 八步文字推演</span>
      </header>

      <div className="login-form-wrap">
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

      <footer className="login-page-footer">
        武汉大学生物化学文字实验智能体 · 课程学习辅助
      </footer>
    </div>
  )
}
