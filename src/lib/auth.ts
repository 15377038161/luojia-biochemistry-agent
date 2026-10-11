// src/lib/auth.ts — 平台超星 OAuth 统一认证（登录基座）
// 单一事实源：PROJECT_ID / AUTH_BASE / 工作区首页映射（全项目只声明一次）。
// 超星登录仅 OAuth2.0 一键登录；session 由平台服务端代理换取后写入 Supabase Auth。
import { getSupabase } from './supabase'

const PROJECT_ID = process.env.NEXT_PUBLIC_CODER_PROJECTS_ID
// 本地开发平台注入隧道地址（浏览器直连，绕开预览网关）；生产环境该变量不存在
// → 空字符串 → 相对路径，由 Nginx 转发。禁止硬编码隧道 URL。
const AUTH_BASE = process.env.NEXT_PUBLIC_CODER_AUTH_PROXY_URL || ''

/**
 * 登录工作区类型：仅代表「登录页选择的入口」，是导航偏好而非权限。
 * 能否真正进入对应工作区，由服务端能力（capabilities）与各业务接口的 403 语义唯一约束。
 */
export type LoginWorkspace = 'student' | 'teacher'

/** 登录入口选择在 sessionStorage 中的键：OAuth 回跳跨页保留，登录闭环/退出登录时清理。 */
export const LOGIN_WORKSPACE_KEY = 'login_workspace'

/** 各工作区落地首页（allowlist 映射，唯一事实源，业务代码只 import 复用，禁止重复声明）。 */
export const WORKSPACE_HOME: Record<LoginWorkspace, string> = {
  student: '/student/map',
  teacher: '/teacher/dashboard',
}

/**
 * 教师选「学生入口」的隔离体验落地路径：practiceMode=true → 前端走 /api/teacher/practice-session，
 * 会话 agent_role='teacher'，不写正式学生成绩、班级统计与学习通同步。区别于正式学生首页。
 */
export const TEACHER_PRACTICE_HOME = '/student/map?practice=1'

// 兜底落地页：学生八步实验地图。无入口偏好且能力查询失败时的最保守默认，向后兼容既有单入口行为。
export const POST_LOGIN_HOME = WORKSPACE_HOME.student

/** 读取登录入口偏好；无偏好返回 null（区分「未选择」与「选择学生」）。 */
export function getSelectedWorkspace(): LoginWorkspace | null {
  if (typeof window === 'undefined') return null
  const value = window.sessionStorage.getItem(LOGIN_WORKSPACE_KEY)
  return value === 'teacher' || value === 'student' ? value : null
}

/** 保存登录入口偏好（仅导航偏好，可被篡改，不参与权限判定）。 */
export function setSelectedWorkspace(workspace: LoginWorkspace): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(LOGIN_WORKSPACE_KEY, workspace)
}

/** 清理登录入口偏好（登录闭环完成或退出登录时调用，避免陈旧偏好污染后续会话）。 */
export function clearSelectedWorkspace(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(LOGIN_WORKSPACE_KEY)
}

/** 登录后落地路由结果：目标路径 + 可选明确提示（无权限/认证失败）。 */
export interface LoginRoute {
  target: string
  notice?: string
}

/**
 * 登录后安全路由：入口偏好（sessionStorage，可被篡改的导航偏好）+ 服务端能力（权限唯一判据）。
 * 服务端能力来自 /api/auth/me 返回的 capabilities / defaultWorkspace。
 * - 教师入口：服务端确认 teacherWorkspace 能力 → /teacher/dashboard；
 *   学生选教师入口（无能力）→ 回退学生首页并带无权限提示（notice），不越权。
 * - 学生入口：具备 teacherPractice 能力（教师）→ 教师体验隔离路径 TEACHER_PRACTICE_HOME；
 *   学生身份 → /student/map。
 * - 无入口偏好（旧会话/直接访问）→ 以服务端 defaultWorkspace 决定方向。
 * - /api/auth/me 非 200（401/session 失效）或网络失败 → 安全返回登录页并带提示，
 *   绝不假装正常学生跳转（能力未知不猜测）。
 */
export async function resolveLoginDestination(): Promise<LoginRoute> {
  const entry = getSelectedWorkspace()

  let response: Response
  try {
    response = await fetch('/api/auth/me')
  } catch {
    return { target: '/login', notice: '身份校验暂不可用，请重新登录。' }
  }
  if (!response.ok) {
    return { target: '/login', notice: '登录状态无效，请重新登录。' }
  }

  const body = (await response.json()) as {
    capabilities?: { teacherWorkspace?: boolean; teacherPractice?: boolean }
    defaultWorkspace?: LoginWorkspace
  }
  const teacherWorkspace = body.capabilities?.teacherWorkspace === true
  const teacherPractice = body.capabilities?.teacherPractice === true
  const defaultWorkspace: LoginWorkspace = body.defaultWorkspace === 'teacher' ? 'teacher' : 'student'

  const effective: LoginWorkspace = entry ?? defaultWorkspace

  if (effective === 'teacher') {
    // 教师方向：仅当服务端确认 teacherWorkspace 能力才进教师工作台；
    // 学生选教师入口（无能力）→ 明确无权限提示，回退学生首页，绝不越权。
    if (teacherWorkspace) return { target: WORKSPACE_HOME.teacher }
    return { target: WORKSPACE_HOME.student, notice: '当前身份没有教师权限，已为你进入学生端。' }
  }

  // 学生方向：教师身份（具备 teacherPractice 能力）→ 隔离体验；学生身份 → 正式学生首页。
  if (teacherPractice) return { target: TEACHER_PRACTICE_HOME }
  return { target: WORKSPACE_HOME.student }
}

/** 将明确提示（notice）拼入目标路径的 query 参数，供目标页面读取展示。 */
export function withNotice(target: string, notice?: string): string {
  if (!notice) return target
  const separator = target.includes('?') ? '&' : '?'
  return `${target}${separator}notice=${encodeURIComponent(notice)}`
}

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

/** 退出登录：同时清理登录入口偏好，避免陈旧偏好污染下一次登录。 */
export async function logout() {
  clearSelectedWorkspace()
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