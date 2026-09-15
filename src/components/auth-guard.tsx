'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { POST_LOGIN_HOME } from '@/lib/auth'

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

/**
 * 全站集中认证守卫（客户端）：
 * session 存 localStorage，只有客户端代码可见，因此守卫 MUST 在客户端执行。
 * 未登录访问受保护路由 → replace('/login')；游客路由直接放行；
 * OAuth 回跳/中转进行中 → 停留加载态，裁决交给根 layout 的回跳闭环组件。
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const evaluate = async () => {
      const { data: { session } } = await getSupabase().auth.getSession()
      if (!session && !isPublicRoute(pathname)) {
        router.replace('/login')
        return
      }
      if (session && pathname === '/login') {
        router.replace(POST_LOGIN_HOME)
        return
      }
      setReady(true)
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
  }, [pathname, router])

  if (!ready) return null
  return <>{children}</>
}