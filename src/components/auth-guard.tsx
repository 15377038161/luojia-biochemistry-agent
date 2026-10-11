'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { resolveLoginDestination, withNotice } from '@/lib/auth'
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

/** 游客/预览路由：/preview/* 无需登录，守卫一律放行 */
function isPublicRoute(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/preview/')
}

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
 * - 游客预览 /preview/* → 直接放行（不依赖 Supabase 配置/session）。
 * - 登录页 /login 与受保护路由 → 先等待运行时 Supabase 配置就绪，再读 session。
 * - session 初始化失败（getSession reject / 配置缺失）→ 失败关闭：展示中文错误 + 重试，绝不永久空白。
 * - 未登录访问受保护路由 → replace('/login')；已登录访问 /login → 按服务端能力解析跳转。
 * - OAuth 回跳/中转进行中 → 停留加载态，裁决交给根 layout 的回跳闭环组件。
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  const evaluate = useCallback(async () => {
    setStatus('loading')
    setErrorMsg(null)
    try {
      await waitForSupabaseConfig()
      const {
        data: { session },
      } = await getSupabase().auth.getSession()
      if (!session && !isPublicRoute(pathname)) {
        router.replace('/login')
        return
      }
      if (session && pathname === '/login') {
        const route = await resolveLoginDestination()
        router.replace(withNotice(route.target, route.notice))
        return
      }
      setStatus('ready')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '登录初始化失败')
      setStatus('error')
    }
  }, [pathname, router])

  useEffect(() => {
    // 游客预览路由：无需登录、无需 Supabase 配置，直接放行
    if (pathname.startsWith('/preview/')) {
      setStatus('ready')
      return
    }
    if (isOAuthCallbackInProgress()) {
      const timer = setTimeout(() => {
        sessionStorage.removeItem('cx_oauth_code')
        sessionStorage.removeItem('cx_checklogin_relay')
        void evaluate()
      }, CALLBACK_HOLD_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }
    void evaluate()
  }, [evaluate, pathname])

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
        <button type="button" onClick={() => void evaluate()}>
          重试
        </button>
      </div>
    )
  }
  return <>{children}</>
}
