// src/lib/authed-fetch.ts — 前端统一鉴权请求（客户端）
// 比 fetch 多带一步：从 Supabase session 读取 access_token，注入 `Authorization: Bearer <token>`。
// 平台 Nginx 会在边界把 Authorization 重命名为 X-Sandbox-Authorization，后端从该头校验。
// 规则：
//   - 存在 session → 自动携带 Bearer 头；
//   - 无 session（预览/游客） → 原样请求不带头，由后端 401 语义决定；
//   - 头部缺省安全：显式传入的 headers 优先，不覆盖调用方自定义的 Authorization。
'use client'

import { getSupabase } from '@/lib/supabase'

/** 快速获取当前 access_token；未登录返回 null（不抛错，便于预览/游客降级）。 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabase().auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

export interface AuthedFetchOptions extends RequestInit {
  /** 是否跳过鉴权头（默认 false：自动携带）。极少用到，保留以支持纯公开请求。 */
  skipAuth?: boolean
}

/**
 * 携带用户 token 的 fetch 封装。返回与原生 fetch 一致的 Response，
 * 调用方仍用 response.ok/json() 处理；若 session 缺失则直接发起原始请求。
 */
export async function authFetch(input: RequestInfo | URL, init: AuthedFetchOptions = {}): Promise<Response> {
  const { skipAuth = false, ...rest } = init
  const headers = new Headers(rest.headers)
  if (!skipAuth && !headers.has('Authorization')) {
    const token = await getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(input, { ...rest, headers })
}

/** 携带 token 的 POST 便捷封装：JSON body，返回已解析 JSON。 */
export async function authPost<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await authFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await response.json()) as T
}