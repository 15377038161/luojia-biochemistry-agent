// src/lib/supabase-server.ts — 后端专用（Next.js API Route，Node.js）
import { createClient } from '@supabase/supabase-js'

export function createSupabaseServer(accessToken?: string) {
  const url = process.env.CODER_SUPABASE_URL
  const anonKey = process.env.CODER_SUPABASE_ANON_KEY
  const tenantId = process.env.CODER_SUPABASE_TENANT_ID
  if (!url || !anonKey || !tenantId) {
    throw new Error('Supabase server environment is incomplete')
  }
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        'X-Instance-ID': tenantId,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    },
  })
}