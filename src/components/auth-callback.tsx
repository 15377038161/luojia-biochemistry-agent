'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { handleOAuthLoginFlow, resolveLoginDestination, clearSelectedWorkspace } from '@/lib/auth'

/**
 * OAuth 回跳闭环：必须在根 layout `body` 的直接子层级、与 AuthGuard 同层级挂载，
 * 不能再被任何依赖 session 的守卫包裹（否则回跳落地时 session 未建立、守卫不渲染，
 * 闭环永不执行 → 结构性死锁）。
 *
 * 调用 handleOAuthLoginFlow() 完成 code 暂存 → checklogin 中转 → exchange 兑换；
 * 登录成功按入口选择 resolvePostLoginHome() 导航到对应工作区首页（学生→/student/map、
 * 教师→/teacher/dashboard）。含 in-flight 去重，StrictMode 双执行也安全。
 */
export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    handleOAuthLoginFlow().then(async (result) => {
      if (result.success) {
        // 先基于服务端能力 + 入口偏好解析目标，再清理入口偏好（顺序不可颠倒）
        const home = await resolveLoginDestination()
        clearSelectedWorkspace()
        router.replace(home)
      }
    })
  }, [router])

  return null
}