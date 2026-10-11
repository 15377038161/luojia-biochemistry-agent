import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSupabaseCredentials,
  hasCompleteSupabaseConfiguration,
} from '../src/lib/supabase-client';

const ENV_NAMES = [
  'CODER_SUPABASE_URL',
  'CODER_SUPABASE_ANON_KEY',
  'CODER_SUPABASE_TENANT_ID',
  'NEXT_PUBLIC_CODER_SUPABASE_TENANT_ID',
  'COZE_SUPABASE_URL',
  'COZE_SUPABASE_ANON_KEY',
  'COZE_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

function withCleanSupabaseEnv(run: () => void): void {
  const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]]));
  for (const name of ENV_NAMES) delete process.env[name];
  try {
    run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('CODER_SUPABASE 环境变量可建立统一公开配置', () => {
  withCleanSupabaseEnv(() => {
    process.env.CODER_SUPABASE_URL = 'https://example.supabase.co/path-that-must-be-removed';
    process.env.CODER_SUPABASE_ANON_KEY = 'publishable-test-key';
    process.env.CODER_SUPABASE_TENANT_ID = 'tenant-test-id';

    assert.deepEqual(getSupabaseCredentials(), {
      url: 'https://example.supabase.co',
      anonKey: 'publishable-test-key',
      tenantId: 'tenant-test-id',
    });
    assert.equal(hasCompleteSupabaseConfiguration(), true);
  });
});

test('CODER_SUPABASE 配置优先于旧 SUPABASE 键名', () => {
  withCleanSupabaseEnv(() => {
    process.env.SUPABASE_URL = 'https://old.example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'old-publishable-key';
    process.env.CODER_SUPABASE_URL = 'https://new.example.supabase.co';
    process.env.CODER_SUPABASE_ANON_KEY = 'new-publishable-key';
    process.env.CODER_SUPABASE_TENANT_ID = 'tenant-test-id';

    assert.deepEqual(getSupabaseCredentials(), {
      url: 'https://new.example.supabase.co',
      anonKey: 'new-publishable-key',
      tenantId: 'tenant-test-id',
    });
    assert.equal(hasCompleteSupabaseConfiguration(), true);
  });
});

test('缺少 tenantId 时不得误报数据库已经接通', () => {
  withCleanSupabaseEnv(() => {
    process.env.CODER_SUPABASE_URL = 'https://example.supabase.co';
    process.env.CODER_SUPABASE_ANON_KEY = 'publishable-test-key';
    assert.equal(hasCompleteSupabaseConfiguration(), false);
  });
});

test('非本地 HTTP Supabase 地址被拒绝', () => {
  withCleanSupabaseEnv(() => {
    process.env.CODER_SUPABASE_URL = 'http://example.supabase.co';
    process.env.CODER_SUPABASE_ANON_KEY = 'publishable-test-key';
    process.env.CODER_SUPABASE_TENANT_ID = 'tenant-test-id';
    assert.throws(() => getSupabaseCredentials(), /必须使用 HTTPS/);
  });
});
