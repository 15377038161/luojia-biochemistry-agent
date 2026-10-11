'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { isPublicRoute, resolveLoginDestination, withNotice, withTimeout } from '@/lib/auth'
import { SUPABASE_CONFIG_READY_EVENT } from '@/lib/supabase-config-inject'

/** 回跳进行中信号（字段与 auth.ts 的 sessionStorage 键一致，改动需同步） */
function isOAuthCallbackInProgress(): boolean {
  const params = new URLSearchParams(window.location.search)
  return (
    params.has('code') ||
    params.has('userinfo') ||
    sessionStorage.getItem('cx_oauth_code') !== null ||
    sessionStorage.getItem('cx_checklogin_relay') !== null
  )
}

/** 守卫挂起超时（毫秒）：回跳标记存在但超时未结算时清标记降级，防白屏卡死 */
const CALLBACK_HOLD_TIMEOUT_MS = 10_000

/** getSession 独立超时（毫秒）：stale session 触发 token 刷新挂起时，受保护页失败关闭、公开页静默忽略 */
const SESSION_CHECK_TIMEOUT_MS = 5_000

/** 等待运行时 Supabase 配置就绪（SupabaseConfigProvider 经 /api/supabase-config 注入），超时降级不阻塞 */
function waitForSupabaseConfig(maxWait = 8000): Promise<void> {
  const cfg = (window as unknown as { __SUPABASE_CONFIG__?: { url?: string; anonKey?: string; tenantId?: string } })
    .__SUPABASE_CONFIG__
  if (cfg?.url && cfg?.anonKey && cfg?.tenantId) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.removeEventListener(SUPABASE_CONFIG_READY_EVENT, finish)
      resolve()
    }
    window.addEventListener(SUPABASE_CONFIG_READY_EVENT, finish)
    setTimeout(finish, maxWait)
  })
}

type AuthStatus = 'loading' | 'ready' | 'error'

/**
 * 全站集中认证守卫（客户端）：
 * - 公开首页 /、登录页 /login、预览 /preview/* → 立即渲染，session 检查放后台，
 *   绝不因 session 初始化失败/超时永久空白。
 * - 受保护路由 → 先等运行时配置 + getSession（独立超时），未确认身份绝不放行；
 *   超时/失败 → 失败关闭：中文错误 + 重试 + 返回登录。
 * - OAuth 回跳/中转进行中 → 停留加载态，裁决交给根 layout 的 AuthCallback。
 * - 用 runId + cancelled 双重防护，杜绝旧 promise 结果覆盖新状态 / unmount 后 setState / 重定向循环。
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const runIdRef = useRef(0)

  useEffect(() => {
    const runId = ++runIdRef.current
    let cancelled = false
    const stillCurrent = () => !cancelled && runId === runIdRef.current

    async function backgroundSessionCheck() {
      // 公开页后台检查：已有 session 则按服务端能力跳走；任何失败静默忽略（登录按钮仍可用）
      try {
        await waitForSupabaseConfig()
        if (!stillCurrent()) return
        const {
          data: { session },
        } = await withTimeout(getSupabase().auth.getSession(), SESSION_CHECK_TIMEOUT_MS)
        if (!stillCurrent()) return
        if (session && (pathname === '/' || pathname === '/login')) {
          const route = await resolveLoginDestination()
          if (!stillCurrent()) return
          router.replace(withNotice(route.target, route.notice))
        }
      } catch {
        // 静默忽略：公开页不因 session 初始化失败阻塞渲染
      }
    }

    async function evaluate() {
      // 公开路由：立即渲染，session 检查放后台，绝不阻塞
      if (isPublicRoute(pathname)) {
        setStatus('ready')
        void backgroundSessionCheck()
        return
      }

      // 受保护路由：必须确认身份，失败关闭（不 ready=true 放行）
      setStatus('loading')
      setErrorMsg(null)
      try {
        await waitForSupabaseConfig()
        if (!stillCurrent()) return
        const {
          data: { session },
        } = await withTimeout(getSupabase().auth.getSession(), SESSION_CHECK_TIMEOUT_MS)
        if (!stillCurrent()) return
        if (!session) {
          router.replace('/login')
          return
        }
        setStatus('ready')
      } catch (err) {
        if (!stillCurrent()) return
        const timedOut = err instanceof Error && err.message === 'TIMEOUT'
        setErrorMsg(
          timedOut
            ? '登录状态检查超时，请重试。'
            : err instanceof Error && err.message
              ? err.message
              : '登录初始化失败，请重试。',
        )
        setStatus('error')
      }
    }

    // OAuth 回跳/中转进行中：停留加载态，超时清标记后重试
    if (isOAuthCallbackInProgress()) {
      const timer = setTimeout(() => {
        sessionStorage.removeItem('cx_oauth_code')
        sessionStorage.removeItem('cx_checklogin_relay')
        if (stillCurrent()) void evaluate()
      }, CALLBACK_HOLD_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }

    void evaluate()
    return () => {
      cancelled = true
    }
  }, [pathname, router])

  if (status === 'loading') {
    return (
      <div className="auth-guard-state" role="status" aria-live="polite">
        <p>正在加载…</p>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="auth-guard-state auth-guard-error" role="alert">
        <p>登录初始化失败：{errorMsg}</p>
        <div className="auth-guard-actions">
          <button type="button" onClick={() => window.location.reload()}>
            重试
          </button>
          <button type="button" onClick={() => router.replace('/login')}>
            返回登录
          </button>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
