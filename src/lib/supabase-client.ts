import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface SupabaseCredentials {
  url: string;
  anonKey: string;
  tenantId: string;
}

/**
 * Supabase 环境变量统一读取。
 *
 * 平台将 Supabase 连接信息注入沙箱进程环境（非文件），统一以 CODER_SUPABASE_* 前缀存在：
 *   - CODER_SUPABASE_URL            REST API 地址
 *   - CODER_SUPABASE_ANON_KEY       anon key（公开，安全性由 RLS 保证）
 *   - CODER_SUPABASE_TENANT_ID      PolarDB Supabase 租户实例 ID（用于 X-Instance-ID 路由）
 *
 * 平台只提供 anon key，本项目禁止持有 SERVICE_ROLE_KEY。
 */
function firstConfigured(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function assertSupabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Supabase URL 配置无效');
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('Supabase URL 必须使用 HTTPS（本地开发除外）');
  }
  return url.origin;
}

function getSupabaseCredentials(): SupabaseCredentials {
  const url = firstConfigured(
    process.env.CODER_SUPABASE_URL,
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const anonKey = firstConfigured(
    process.env.CODER_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const tenantId = firstConfigured(
    process.env.CODER_SUPABASE_TENANT_ID,
    process.env.NEXT_PUBLIC_CODER_SUPABASE_TENANT_ID,
  );

  if (!url) {
    throw new Error('Supabase URL 未配置（期望 CODER_SUPABASE_URL）');
  }
  if (!anonKey) {
    throw new Error('Supabase anon key 未配置（期望 CODER_SUPABASE_ANON_KEY）');
  }
  if (!tenantId) {
    throw new Error('Supabase 租户实例 ID 未配置（期望 CODER_SUPABASE_TENANT_ID）');
  }

  return { url: assertSupabaseUrl(url), anonKey, tenantId };
}

function hasCompleteSupabaseConfiguration(): boolean {
  try {
    getSupabaseCredentials();
    return true;
  } catch {
    return false;
  }
}

/**
 * 创建低权限 Supabase 客户端（仅 anon key，不持有 service role）。
 *
 * @param token 可选：登录用户 JWT，透传后配合 RLS 做用户级权限控制
 */
function createSupabaseClient(token?: string): SupabaseClient {
  const { url, anonKey, tenantId } = getSupabaseCredentials();
  const globalOptions: { headers?: Record<string, string> } = {
    headers: {
      'X-Instance-ID': tenantId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };

  return createClient(url, anonKey, {
    global: globalOptions,
    db: {
      timeout: 60000,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * 兼容旧调用方语义：返回一个数据访问客户端。
 *
 * 平台禁止 service role，默认以 anon key + X-Instance-ID 建客户端；
 * 需要按登录用户访问时传入其 JWT（由各业务路由经身份校验后提供）。
 */
function getSupabaseAdminClient(token?: string): SupabaseClient {
  return createSupabaseClient(token);
}

export { getSupabaseCredentials, getSupabaseAdminClient, hasCompleteSupabaseConfiguration };