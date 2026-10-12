import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { AI_MODEL_DEFAULTS, invokeAi } from '../src/lib/ai-gateway';

// 离线 mock 前置：从 SDK 真实位置解析其打包使用的 axios 实例，patch adapter 拦截真实网络请求。
// 禁止真实付费模型请求；不读取/打印真实环境密钥。
const localRequire = createRequire(import.meta.url);
const sdkEntry = localRequire.resolve('coder-coding-dev-sdk');
const sdkRequire = createRequire(realpathSync(sdkEntry));
const axios = sdkRequire('axios');
const originalAdapter = axios.defaults.adapter;

const SENTINEL_KEY = 'test-sentinel-key-not-real';

function installFailureAdapter(status: number, message: string): () => number {
  let count = 0;
  axios.defaults.adapter = async (config: unknown) => {
    count += 1;
    throw new axios.AxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_RESPONSE',
      config,
      null,
      { status, statusText: 'Error', data: { error: { message } }, headers: {}, config },
    );
  };
  return () => count;
}

function restoreAdapter(): void {
  axios.defaults.adapter = originalAdapter;
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test('模型分工固定为质量评测与高频问答两条服务端通道', () => {
  assert.equal(AI_MODEL_DEFAULTS.quality, 'doubao-seed-1-8-251228');
  assert.equal(AI_MODEL_DEFAULTS.fast, 'deepseek-v4-flash');
});

test('AI_GATEWAY_RETRY_COUNT=0 时仅发起一次请求', { concurrency: false }, async () => {
  const savedRetry = process.env.AI_GATEWAY_RETRY_COUNT;
  const savedKey = process.env.CODER_CODING_API_KEY;
  process.env.AI_GATEWAY_RETRY_COUNT = '0';
  process.env.CODER_CODING_API_KEY = SENTINEL_KEY;
  const calls = installFailureAdapter(503, 'temporary upstream failure');
  try {
    await assert.rejects(() => invokeAi([{ role: 'user', content: 'test' }], { workload: 'quality' }));
    assert.equal(calls(), 1);
  } finally {
    restoreAdapter();
    restoreEnv('AI_GATEWAY_RETRY_COUNT', savedRetry);
    restoreEnv('CODER_CODING_API_KEY', savedKey);
  }
});

test('AI_GATEWAY_RETRY_COUNT=1 时最多发起两次请求', { concurrency: false }, async () => {
  const savedRetry = process.env.AI_GATEWAY_RETRY_COUNT;
  const savedKey = process.env.CODER_CODING_API_KEY;
  process.env.AI_GATEWAY_RETRY_COUNT = '1';
  process.env.CODER_CODING_API_KEY = SENTINEL_KEY;
  const calls = installFailureAdapter(503, 'temporary upstream failure');
  try {
    await assert.rejects(() => invokeAi([{ role: 'user', content: 'test' }], { workload: 'quality' }));
    assert.equal(calls(), 2);
  } finally {
    restoreAdapter();
    restoreEnv('AI_GATEWAY_RETRY_COUNT', savedRetry);
    restoreEnv('CODER_CODING_API_KEY', savedKey);
  }
});

test('AI_GATEWAY_RETRY_COUNT 非法或越界值明确报错', { concurrency: false }, async () => {
  const savedRetry = process.env.AI_GATEWAY_RETRY_COUNT;
  try {
    for (const bad of ['abc', '-1', '1.5', '999']) {
      process.env.AI_GATEWAY_RETRY_COUNT = bad;
      await assert.rejects(
        () => invokeAi([{ role: 'user', content: 'test' }], { workload: 'quality' }),
        /AI_GATEWAY_RETRY_COUNT/,
      );
    }
  } finally {
    restoreEnv('AI_GATEWAY_RETRY_COUNT', savedRetry);
  }
});
