// src/lib/supabase.ts — Next.js 前端专用（浏览器端 Auth / 白名单场景）
// 会话存储于浏览器 localStorage（persistSession），安全由 RLS 保证。
// 业务 CRUD 请走后端 API Route + createSupabaseServer()。
import { createClient } from '@supabase/supabase-js'

let _supabase: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (_supabase) return _supabase
  const url = process.env.NEXT_PUBLIC_CODER_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_CODER_SUPABASE_ANON_KEY
  const tenantId = process.env.NEXT_PUBLIC_CODER_SUPABASE_TENANT_ID
  if (!url || !anonKey || !tenantId) {
    throw new Error('Supabase environment is incomplete')
  }
  _supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: true, persistSession: true },
    global: { headers: { 'X-Instance-ID': tenantId } },
  })
  return _supabase
}