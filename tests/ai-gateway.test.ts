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

test('深度思考扩展字段不兼容时自动移除后重试，且密钥不进入错误或返回值', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.AI_GATEWAY_API_KEY;
  const originalRetries = process.env.AI_GATEWAY_RETRY_COUNT;
  const bodies: Array<Record<string, unknown>> = [];
  process.env.AI_GATEWAY_API_KEY = 'test-secret-that-must-not-leak';
  process.env.AI_GATEWAY_RETRY_COUNT = '1';
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (bodies.length === 1) return new Response(JSON.stringify({ error: { message: 'unknown field enable_thinking' } }), { status: 400 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{\"ok\":true}' } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await invokeAi([{ role: 'user', content: 'test' }], { workload: 'quality', deepThinking: true });
    assert.equal(result.model, 'qwen3.8-max');
    assert.equal(result.content, '{\"ok\":true}');
    assert.equal(bodies[0].enable_thinking, true);
    assert.equal('enable_thinking' in bodies[1], false);
    assert.doesNotMatch(JSON.stringify(result), /test-secret/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv('AI_GATEWAY_API_KEY', originalKey);
    restoreEnv('AI_GATEWAY_RETRY_COUNT', originalRetries);
  }
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
