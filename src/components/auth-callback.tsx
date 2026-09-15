'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { handleOAuthLoginFlow, POST_LOGIN_HOME } from '@/lib/auth'

/**
 * OAuth 回跳闭环：必须在根 layout `body` 的直接子层级、与 AuthGuard 同层级挂载，
 * 不能再被任何依赖 session 的守卫包裹（否则回跳落地时 session 未建立、守卫不渲染，
 * 闭环永不执行 → 结构性死锁）。
 *
 * 调用 handleOAuthLoginFlow() 完成 code 暂存 → checklogin 中转 → exchange 兑换；
 * 登录成功导航 POST_LOGIN_HOME。含 in-flight 去重，StrictMode 双执行也安全。
 */
export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    handleOAuthLoginFlow().then((result) => {
      if (result.success) {
        router.replace(POST_LOGIN_HOME)
      }
    })
  }, [router])

  return null
}