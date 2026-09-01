import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorFromUnknown } from '../src/lib/api-result';
import { AiValidationError } from '../src/lib/errors';

test('Supabase 数据库错误（缺列 42703）分类为 DB_ERROR，绝不伪装成 AI 输出校验错误', () => {
  const dbError = Object.assign(new Error('column agent_sessions.session_mode does not exist'), {
    code: '42703',
    details: '...',
    hint: null,
  });
  const result = errorFromUnknown(dbError);
  assert.equal(result.code, 'DB_ERROR');
  assert.match(result.message, /42703/);
  assert.match(result.message, /session_mode/);
  assert.notEqual(result.code, 'AI_OUTPUT_INVALID');
});

test('PostgREST 错误（PGRST205）同样分类为 DB_ERROR 并透出 code 与 message', () => {
  const dbError = Object.assign(new Error('column "session_mode" does not exist'), { code: 'PGRST205' });
  const result = errorFromUnknown(dbError);
  assert.equal(result.code, 'DB_ERROR');
  assert.match(result.message, /PGRST205/);
});

test('只有 AiValidationError 才映射为“智能体返回内容未通过校验”', () => {
  const result = errorFromUnknown(new AiValidationError('evaluation 缺少 decision'));
  assert.equal(result.code, 'AI_OUTPUT_INVALID');
  assert.match(result.message, /未通过校验/);
});

test('鉴权错误与状态错误按各自类型返回', () => {
  assert.equal(errorFromUnknown(new Error('AUTH_REQUIRED')).code, 'AUTH_REQUIRED');
  assert.equal(errorFromUnknown(new Error('FORBIDDEN')).code, 'FORBIDDEN');
  assert.equal(errorFromUnknown(new Error('STATE_INVALID')).code, 'STATE_INVALID');
});

test('网络错误分类为 NETWORK_ERROR', () => {
  const result = errorFromUnknown(new TypeError('fetch failed'));
  assert.equal(result.code, 'NETWORK_ERROR');
});

test('超时错误分类为 AI_TIMEOUT', () => {
  const result = errorFromUnknown(new Error('智能体请求超时'));
  assert.equal(result.code, 'AI_TIMEOUT');
});
