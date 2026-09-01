import { NextResponse } from 'next/server';
import type { ApiError, ApiResult } from '@/domain/agent';
import {
  asNetworkError,
  asSupabaseDatabaseError,
  asTimeoutError,
  isAiValidationError,
  isSupabaseAuthError,
} from './errors';

export function requestId(): string {
  return crypto.randomUUID();
}

export function ok<T>(data: T, id = requestId(), status = 200): NextResponse<ApiResult<T>> {
  return NextResponse.json({ ok: true, data, requestId: id }, { status });
}

export function fail(error: ApiError, id = requestId(), status = 400): NextResponse<ApiResult<never>> {
  return NextResponse.json({ ok: false, error, requestId: id }, { status });
}

export function errorFromAiValidation(message = '智能体返回内容未通过校验，请重试。'): ApiError {
  return { code: 'AI_OUTPUT_INVALID', message, retryable: true };
}

export function errorFromDb(code: string, message: string): ApiError {
  return { code: 'DB_ERROR', message: `数据库服务异常（${code}）：${message}`, retryable: true };
}

export function errorFromNetwork(message: string): ApiError {
  return { code: 'NETWORK_ERROR', message: `网络异常：${message}`, retryable: true };
}

export function errorFromTimeout(message = '智能体响应超时，回答已经保留，请稍后重试。'): ApiError {
  return { code: 'AI_TIMEOUT', message, retryable: true };
}

// 错误分类唯一入口：数据库 / 鉴权 / AI 输出校验 / 网络超时分离。
// “智能体返回内容未通过校验”只可能来自 AiValidationError 或显式 sentinel；
// 数据库异常必须透出 Supabase code 与 message（不含密钥），绝不伪装成 AI 输出校验错误。
export function errorFromUnknown(error: unknown): ApiError {
  if (isAiValidationError(error)) return errorFromAiValidation();
  if (isSupabaseAuthError(error)) return { code: 'AUTH_REQUIRED', message: '登录状态无效，请重新登录。', retryable: false };
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('AUTH_REQUIRED')) return { code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false };
  if (message.includes('FORBIDDEN')) return { code: 'FORBIDDEN', message: '你无权访问这条记录。', retryable: false };
  if (message.includes('STATE_INVALID')) return { code: 'STATE_INVALID', message: '实验进度已变化，请刷新后重试。', retryable: false };
  const timeout = asTimeoutError(error);
  if (timeout) return errorFromTimeout(timeout);
  const network = asNetworkError(error);
  if (network) return errorFromNetwork(network);
  const dbError = asSupabaseDatabaseError(error);
  if (dbError) return errorFromDb(dbError.code, dbError.message);
  return { code: 'VALIDATION_ERROR', message: message || '服务器内部错误，请稍后重试。', retryable: false };
}
