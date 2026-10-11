import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { invokeAi } from '../src/lib/ai-gateway';
import { errorFromUnknown } from '../src/lib/api-result';

// 离线 mock 前置：从 SDK 真实位置解析其打包使用的 axios 实例，patch adapter 拦截真实网络请求。
// 禁止真实付费模型请求；哨兵为临时值，非真实密钥。
const localRequire = createRequire(import.meta.url);
const sdkEntry = localRequire.resolve('coder-coding-dev-sdk');
const sdkRequire = createRequire(realpathSync(sdkEntry));
const axios = sdkRequire('axios');
const originalAdapter = axios.defaults.adapter;

const SENTINEL = 'SENTINEL_SECRET_abc123';

function restoreAdapter(): void {
  axios.defaults.adapter = originalAdapter;
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test('上游 message/data 回显哨兵时收敛为 AI_UPSTREAM_ERROR 且不泄漏哨兵', { concurrency: false }, async () => {
  const savedKey = process.env.CODER_CODING_API_KEY;
  process.env.CODER_CODING_API_KEY = 'sentinel-key';
  axios.defaults.adapter = async (config: unknown) => {
    throw new axios.AxiosError(
      'upstream rejected request',
      'ERR_BAD_REQUEST',
      config,
      null,
      { status: 401, statusText: 'Unauthorized', data: { error: { message: `invalid credential ${SENTINEL}` }, detail: SENTINEL }, headers: {}, config },
    );
  };
  try {
    let caught: unknown;
    try {
      await invokeAi([{ role: 'user', content: 'x' }], { workload: 'quality' });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof Error, 'invokeAi 应抛出 SDK 上游错误');
    // 泄漏源确认：SDK APIError 自身含哨兵（这就是需要被收敛的风险）。
    assert.equal(caught.name, 'APIError');
    assert.ok(caught.message.includes(SENTINEL), 'SDK APIError.message 含哨兵（泄漏源）');
    // 收敛后：类别 + 状态保留，message/整对象均不含哨兵。
    const result = errorFromUnknown(caught);
    assert.equal(result.code, 'AI_UPSTREAM_ERROR');
    assert.equal(result.status, 401);
    assert.ok(!result.message.includes(SENTINEL), '收敛后的 message 不得含哨兵');
    assert.ok(!JSON.stringify(result).includes(SENTINEL), '收敛后的整个 ApiError 不得含哨兵');
  } finally {
    restoreAdapter();
    restoreEnv('CODER_CODING_API_KEY', savedKey);
  }
});

test('网络错误（name=NetworkError）含哨兵时收敛为 NETWORK_ERROR 且不泄漏哨兵', () => {
  const networkError = Object.assign(new Error(`connect ECONNREFUSED ${SENTINEL}`), { name: 'NetworkError' });
  const result = errorFromUnknown(networkError);
  assert.equal(result.code, 'NETWORK_ERROR');
  assert.ok(!result.message.includes(SENTINEL), '收敛后的 message 不得含哨兵');
  assert.ok(!JSON.stringify(result).includes(SENTINEL), '收敛后的整个 ApiError 不得含哨兵');
});

test('SDK APIError 缺 status 仍收敛为 AI_UPSTREAM_ERROR（不推断为结构错误）', () => {
  const apiErrorMissingStatus = Object.assign(new Error(`无效的模型响应结构 ${SENTINEL}`), { name: 'APIError' });
  const result = errorFromUnknown(apiErrorMissingStatus);
  assert.equal(result.code, 'AI_UPSTREAM_ERROR');
  assert.ok(!result.message.includes(SENTINEL), '收敛后的 message 不得含哨兵');
  assert.ok(!result.message.includes('模型响应结构'), '不得透传原始 message');
});

test('SDK APIError 非法 status 仍收敛为 AI_UPSTREAM_ERROR 且不保留非法数字', () => {
  const apiErrorInvalidStatus = Object.assign(new Error(`bad status ${SENTINEL}`), { name: 'APIError', status: 'abc' });
  const result = errorFromUnknown(apiErrorInvalidStatus);
  assert.equal(result.code, 'AI_UPSTREAM_ERROR');
  assert.equal(result.status, undefined, '非法 status 不应保留为数字字段');
  assert.ok(!result.message.includes(SENTINEL), '收敛后的 message 不得含哨兵');
});

test('只有 AiValidationError 才映射为 AI_OUTPUT_INVALID', () => {
  const aiValidation = Object.assign(new Error('智能体返回内容未通过校验'), { name: 'AiValidationError' });
  const result = errorFromUnknown(aiValidation);
  assert.equal(result.code, 'AI_OUTPUT_INVALID');
});

test('errorFromUnknown 收敛过程不向日志输出原始 SDK 错误对象', () => {
  const originalError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const sdkError = Object.assign(new Error(`secret ${SENTINEL}`), { name: 'APIError', status: 500, data: { key: SENTINEL } });
    const result = errorFromUnknown(sdkError);
    assert.equal(result.code, 'AI_UPSTREAM_ERROR');
    assert.equal(logged.length, 0, 'errorFromUnknown 不得 console.error 原始错误对象');
  } finally {
    console.error = originalError;
  }
});

test('成功响应正常返回内容', { concurrency: false }, async () => {
  const savedKey = process.env.CODER_CODING_API_KEY;
  process.env.CODER_CODING_API_KEY = 'sentinel-key';
  axios.defaults.adapter = async (config: unknown) => ({
    status: 200,
    statusText: 'OK',
    data: { choices: [{ message: { content: 'ok-answer' } }] },
    headers: {},
    config,
  });
  try {
    const result = await invokeAi([{ role: 'user', content: 'x' }], { workload: 'quality' });
    assert.equal(result.content, 'ok-answer');
  } finally {
    restoreAdapter();
    restoreEnv('CODER_CODING_API_KEY', savedKey);
  }
});
