import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getReportBuffer, createWrappedFetch } from 'coze-coding-dev-sdk';

interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

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
    process.env.COZE_SUPABASE_URL,
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const anonKey = firstConfigured(
    process.env.COZE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!url) {
    throw new Error('Supabase URL 未配置');
  }
  if (!anonKey) {
    throw new Error('Supabase Publishable Key 未配置');
  }

  return { url: assertSupabaseUrl(url), anonKey };
}

function getSupabaseServiceRoleKey(): string | undefined {
  return firstConfigured(
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function hasCompleteSupabaseConfiguration(): boolean {
  try {
    getSupabaseCredentials();
    return Boolean(getSupabaseServiceRoleKey());
  } catch {
    return false;
  }
}

function createSupabaseClient(key: string, token?: string): SupabaseClient {
  const { url } = getSupabaseCredentials();
  const globalOptions: { headers?: Record<string, string>; fetch?: typeof fetch } = {};
  if (token) {
    globalOptions.headers = { Authorization: `Bearer ${token}` };
  }
  try {
    const buffer = getReportBuffer();
    if (buffer) {
      globalOptions.fetch = createWrappedFetch(buffer, 'supabase');
    }
  } catch {
    // Silent — reporting setup failure should not block client creation
  }

  return createClient(url, key, {
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

function getSupabaseAdminClient(): SupabaseClient {
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!serviceRoleKey) {
    throw new Error('Supabase Service Role Key 未配置');
  }
  return createSupabaseClient(serviceRoleKey);
}

export {
  getSupabaseCredentials,
  getSupabaseAdminClient,
  hasCompleteSupabaseConfiguration,
};
