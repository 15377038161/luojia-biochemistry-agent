'use client'

import Image from 'next/image'
import { useState } from 'react'
import { FlaskConical, Dna, ShieldCheck, ArrowRight, BookOpen, GraduationCap } from 'lucide-react'
import { loginWithChaoxingOAuth, setSelectedWorkspace, type LoginWorkspace } from '@/lib/auth'
import BrandLockup from '@/components/brand-lockup'

/** 双入口选项元数据：仅决定登录后跳转目标，不授予任何角色/权限。 */
const ENTRY_OPTIONS: Array<{ value: LoginWorkspace; label: string; hint: string; icon: typeof BookOpen }> = [
  { value: 'student', label: '学生入口', hint: '进入八步实验地图', icon: BookOpen },
  { value: 'teacher', label: '教师入口', hint: '进入教学工作台', icon: GraduationCap },
]

/**
 * 超星 OAuth 一键登录表单：登录页 /login 的核心交互组件。
 * - 先选择学生/教师入口（写入 sessionStorage，OAuth 回跳跨页保留），
 *   再点击「超星一键登录」→ loginWithChaoxingOAuth() 顶层跳转超星授权页。
 * - 已登录用户访问 /login 的跳转由根 layout 的 AuthGuard 统一处理（唯一拦截点）。
 *
 * 入口选择只决定登录后的落地页；权限仍由服务端能力（capabilities）与各接口 403 语义约束。
 *
 * 视觉结构复用「珞珈山小实验家 · 科学探险手账」系统（login.css）：
 * 桌面端左右分栏——左侧品牌宣传区（标题 + 特性），右侧登录卡片；
 * 移动端回退为单列，宣传区精简后置于卡片上方。
 */
export default function LoginForm() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState('')
  const [workspace, setWorkspace] = useState<LoginWorkspace>('student')

  const handleSelect = (next: LoginWorkspace) => {
    if (isPending) return
    setWorkspace(next)
    setSelectedWorkspace(next)
  }

  const handleLogin = async () => {
    if (isPending) return
    setIsPending(true)
    setError('')
    // 确保入口选择在跳转前已持久化（覆盖直接点击但未触发 onSelect 的边界）
    setSelectedWorkspace(workspace)
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

      <main className="login-page-stage">
        {/* 左侧品牌宣传区 */}
        <section className="login-intro">
          <p className="login-intro-eyebrow">珞珈山小实验家 · 科学探险手账</p>
          <h1 className="login-intro-title">用文字推演，<br /><span className="login-intro-accent">理解 EGFP 八步实验</span></h1>
          <p className="login-intro-desc">
            从基因与引物到蛋白纯化，一步步跟着文字实验记录，把抽象的生化流程走成清晰可见的路径。
          </p>
          <ul className="login-intro-features">
            <li>
              <span className="login-intro-feature-icon"><FlaskConical size={18} strokeWidth={1.8} /></span>
              <div>
                <strong>八步实验全流程</strong>
                <small>基因、载体、转化诱导到浓度测定</small>
              </div>
            </li>
            <li>
              <span className="login-intro-feature-icon"><Dna size={18} strokeWidth={1.8} /></span>
              <div>
                <strong>EGFP 荧光蛋白主题</strong>
                <small>每一步都围绕绿色荧光蛋白展开</small>
              </div>
            </li>
            <li>
              <span className="login-intro-feature-icon"><ShieldCheck size={18} strokeWidth={1.8} /></span>
              <div>
                <strong>学习通安全授权</strong>
                <small>无需注册，一键以校园身份进入</small>
              </div>
            </li>
          </ul>
        </section>

        {/* 右侧登录卡片 */}
        <div className="login-form-wrap">
          <div className="login-form-card">
            <p className="login-form-kicker">超星学习通 · 统一身份登录</p>
            <h2 className="login-form-title">欢迎使用</h2>
            <p className="login-form-desc">使用学习通身份进入 EGFP 八步文字实验，无需注册账号。</p>

            {error && <p className="login-form-error" role="alert">{error}</p>}

            <fieldset className="login-entry-fieldset">
              <legend className="login-entry-legend">选择你的登录身份</legend>
              <div className="login-entry-grid" role="radiogroup" aria-label="登录入口选择">
                {ENTRY_OPTIONS.map((option) => {
                  const Icon = option.icon
                  const active = workspace === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`login-entry-option${active ? ' is-active' : ''}`}
                      disabled={isPending}
                      onClick={() => handleSelect(option.value)}
                    >
                      <span className="login-entry-icon"><Icon size={18} strokeWidth={1.8} /></span>
                      <span className="login-entry-text">
                        <strong>{option.label}</strong>
                        <small>{option.hint}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <button type="button" className="login-oauth-button" disabled={isPending} onClick={handleLogin}>
              <Image src="/brand/xuexitong-icon.jpg" alt="" width={24} height={24} className="login-oauth-icon" />
              {isPending ? '正在连接学习通…' : '超星一键登录'}
              {!isPending && <ArrowRight size={17} strokeWidth={2.2} className="login-oauth-arrow" />}
            </button>

            <p className="login-form-footnote">授权后由平台安全代理完成身份确认与登录。</p>
          </div>
        </div>
      </main>

      <footer className="login-page-footer">
        武汉大学生物化学文字实验智能体 · 课程学习辅助
      </footer>
    </div>
  )
}
