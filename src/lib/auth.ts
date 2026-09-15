// src/lib/auth.ts — 平台超星 OAuth 统一认证（登录基座）
// 单一事实源：PROJECT_ID / AUTH_BASE / POST_LOGIN_HOME（全项目只声明一次）。
// 超星登录仅 OAuth2.0 一键登录；session 由平台服务端代理换取后写入 Supabase Auth。
import { getSupabase } from './supabase'

const PROJECT_ID = process.env.NEXT_PUBLIC_CODER_PROJECTS_ID
// 本地开发平台注入隧道地址（浏览器直连，绕开预览网关）；生产环境该变量不存在
// → 空字符串 → 相对路径，由 Nginx 转发。禁止硬编码隧道 URL。
const AUTH_BASE = process.env.NEXT_PUBLIC_CODER_AUTH_PROXY_URL || ''

// 登录后导航去向（唯一事实源）：业务首页。业务代码只在本文件 import 复用，禁止重复声明。
export const POST_LOGIN_HOME = '/'

const AUTH_HEADERS = {
  'Content-Type': 'application/json',
  // 本地模式绕过 ngrok 免费版浏览器警告页；生产环境无副作用，必须保留
  'ngrok-skip-browser-warning': 'true',
}

export interface LoginResult {
  success: boolean
  error?: string
}

/** 获取当前登录用户 */
export async function getCurrentUser() {
  const { data: { user } } = await getSupabase().auth.getUser()
  return user
}

/** 退出登录 */
export async function logout() {
  await getSupabase().auth.signOut()
}

/**
 * 超星 OAuth2.0 一键登录：向平台服务端换取授权跳转地址后顶层导航到超星授权页。
 * 授权完成后超星会 302 回当前页面并追加 code/state，由 handleOAuthLoginFlow() 闭环。
 */
export async function loginWithChaoxingOAuth(): Promise<LoginResult> {
  const redirectUri = window.location.href.split('#')[0]
  try {
    const res = await fetch(
      `${AUTH_BASE}/v1/api/coder/proxy/auth/chaoxing-oauth/authorize-url?redirect_uri=${encodeURIComponent(redirectUri)}`,
      { headers: AUTH_HEADERS },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { success: false, error: body.message || `获取授权地址失败 (${res.status})` }
    }
    const { authorizeUrl } = await res.json()
    // 必须顶层导航：fetch 跟随跨域 302 会被 CORS 拦截
    window.location.assign(authorizeUrl)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '跳转授权页失败' }
  }
}

// in-flight 去重（模块级单一变量）：StrictMode dev 双执行 / 多挂载点并发兜底
let inflight: Promise<LoginResult> | null = null

async function doExchange(code: string, userinfo?: string): Promise<LoginResult> {
  const res = await fetch(`${AUTH_BASE}/v1/api/coder/proxy/auth/chaoxing-oauth/exchange`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ code, projectId: PROJECT_ID, ...(userinfo ? { userinfo } : {}) }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    cleanOAuthParamsFromUrl()
    return { success: false, error: body.message || '登录链接已失效，请重新登录' }
  }

  const session = await res.json()
  const { error } = await getSupabase().auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (error) {
    cleanOAuthParamsFromUrl()
    return { success: false, error: error.message }
  }

  cleanOAuthParamsFromUrl()
  return { success: true }
}

/** 用 replaceState 移除 URL 中的 OAuth 回跳参数（不留历史记录）。 */
function cleanOAuthParamsFromUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('userinfo')
  window.history.replaceState({}, '', url.toString())
}

// ── checklogin 中转（取回浏览器超星登录凭证）────────────────────
const CX_CODE_KEY = 'cx_oauth_code'
const CX_RELAY_KEY = 'cx_checklogin_relay'
const RELAY_WINDOW_MS = 5000

/**
 * 入口页登录闭环编排（唯一公开挂载入口）：首次拿到 code → 暂存并中转 checklogin；
 * 中转回跳/已中转 → 观测 userinfo 后兑换 session。幂等（in-flight 去重）。
 */
export function handleOAuthLoginFlow(): Promise<LoginResult> {
  if (inflight) return inflight
  inflight = doHandleOAuthLoginFlow().finally(() => {
    inflight = null
  })
  return inflight
}

async function doHandleOAuthLoginFlow(): Promise<LoginResult> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const userinfo = params.get('userinfo')
  const relayTs = Number(sessionStorage.getItem(CX_RELAY_KEY) || '0')
  const inRelayWindow = relayTs > 0 && Date.now() - relayTs < RELAY_WINDOW_MS

  // 首次拿到 code 且不在中转窗口：暂存 code、记录中转时间戳、清理 URL，立即中转
  if (code && !inRelayWindow) {
    sessionStorage.setItem(CX_CODE_KEY, code)
    sessionStorage.setItem(CX_RELAY_KEY, String(Date.now()))
    cleanOAuthParamsFromUrl()
    try {
      const backurl = window.location.href.split('#')[0]
      const res = await fetch(
        `${AUTH_BASE}/v1/api/coder/proxy/auth/chaoxing-checklogin/url?backurl=${encodeURIComponent(backurl)}`,
        { headers: AUTH_HEADERS },
      )
      if (res.ok) {
        const { checkloginUrl } = await res.json()
        window.location.assign(checkloginUrl)
        return { success: false }
      }
      console.warn('[auth] checklogin 中转地址获取失败，跳过中转直接登录:', res.status)
      sessionStorage.removeItem(CX_RELAY_KEY)
    } catch (e) {
      console.warn('[auth] checklogin 中转异常，跳过中转直接登录:', e)
      sessionStorage.removeItem(CX_RELAY_KEY)
    }
  }

  // 中转窗口保护：窗口内再次进入且无 code/userinfo，等待真正回跳，绝不兑换
  if (inRelayWindow && !code && !userinfo) {
    return { success: false }
  }

  const relayedUserinfo = userinfo ? userinfo.replace(/ /g, '+') : undefined
  const pendingCode = sessionStorage.getItem(CX_CODE_KEY) || code
  if (pendingCode) {
    try {
      return await doExchange(pendingCode, relayedUserinfo)
    } finally {
      sessionStorage.removeItem(CX_RELAY_KEY)
      sessionStorage.removeItem(CX_CODE_KEY)
      cleanOAuthParamsFromUrl()
    }
  }
  sessionStorage.removeItem(CX_RELAY_KEY)
  cleanOAuthParamsFromUrl()
  return { success: false }
}