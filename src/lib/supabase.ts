// src/lib/supabase.ts — Next.js 前端专用（浏览器端 Auth / 白名单场景）
// 会话存储于浏览器 localStorage（persistSession），安全由 RLS 保证。
// 业务 CRUD 请走后端 API Route + createSupabaseServer()。
import { createClient } from '@supabase/supabase-js'

let _supabase: ReturnType<typeof createClient> | null = null

/**
 * 读取浏览器端 Supabase 配置：优先运行时注入的 window.__SUPABASE_CONFIG__
 * （由 SupabaseConfigProvider 经 /api/supabase-config 注入，生产环境唯一可信来源），
 * 缺失时回退构建期 NEXT_PUBLIC_CODER_SUPABASE_*（本地开发兜底）。
 * 只使用 anon key（公开，安全由 RLS 保证），绝不读取/暴露 service-role。
 */
function resolveSupabaseConfig(): { url: string; anonKey: string; tenantId: string } {
  const runtime =
    typeof window !== 'undefined'
      ? (window as unknown as { __SUPABASE_CONFIG__?: { url?: string; anonKey?: string; tenantId?: string } })
          .__SUPABASE_CONFIG__
      : undefined
  const url = runtime?.url || process.env.NEXT_PUBLIC_CODER_SUPABASE_URL
  const anonKey = runtime?.anonKey || process.env.NEXT_PUBLIC_CODER_SUPABASE_ANON_KEY
  const tenantId = runtime?.tenantId || process.env.NEXT_PUBLIC_CODER_SUPABASE_TENANT_ID
  if (!url || !anonKey || !tenantId) {
    throw new Error('Supabase 配置尚未就绪，请刷新页面重试。')
  }
  return { url, anonKey, tenantId }
}

export function getSupabase() {
  if (_supabase) return _supabase
  const { url, anonKey, tenantId } = resolveSupabaseConfig()
  _supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: true, persistSession: true },
    global: { headers: { 'X-Instance-ID': tenantId } },
  })
  return _supabase
}