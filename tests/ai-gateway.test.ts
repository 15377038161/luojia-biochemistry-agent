import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_MODEL_DEFAULTS, invokeAi } from '../src/lib/ai-gateway';

test('模型分工固定为质量评测与高频问答两条服务端通道', () => {
  assert.equal(AI_MODEL_DEFAULTS.quality, 'qwen3.8-max');
  assert.equal(AI_MODEL_DEFAULTS.fast, 'deepseek-v4-flash-0731');
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
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await invokeAi([{ role: 'user', content: 'test' }], { workload: 'quality', deepThinking: true });
    assert.equal(result.model, 'qwen3.8-max');
    assert.equal(result.content, '{"ok":true}');
    assert.equal(bodies[0].enable_thinking, true);
    assert.equal('enable_thinking' in bodies[1], false);
    assert.doesNotMatch(JSON.stringify(result), /test-secret/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = originalKey;
    if (originalRetries === undefined) delete process.env.AI_GATEWAY_RETRY_COUNT; else process.env.AI_GATEWAY_RETRY_COUNT = originalRetries;
  }
});

test('生产配置允许将网关重试次数设为0，避免慢评阅跨越平台请求窗口', { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.AI_GATEWAY_API_KEY;
  const originalRetries = process.env.AI_GATEWAY_RETRY_COUNT;
  let calls = 0;
  process.env.AI_GATEWAY_API_KEY = 'test-secret';
  process.env.AI_GATEWAY_RETRY_COUNT = '0';
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: 'temporary upstream failure' } }), { status: 503 });
  }) as typeof fetch;
  try {
    await assert.rejects(() => invokeAi([{ role: 'user', content: 'test' }], { workload: 'quality' }));
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = originalKey;
    if (originalRetries === undefined) delete process.env.AI_GATEWAY_RETRY_COUNT; else process.env.AI_GATEWAY_RETRY_COUNT = originalRetries;
  }
});
