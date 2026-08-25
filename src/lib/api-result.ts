import { NextResponse } from 'next/server';
import type { ApiError, ApiResult } from '@/domain/agent';

export function requestId(): string {
  return crypto.randomUUID();
}

export function ok<T>(data: T, id = requestId(), status = 200): NextResponse<ApiResult<T>> {
  return NextResponse.json({ ok: true, data, requestId: id }, { status });
}

export function fail(error: ApiError, id = requestId(), status = 400): NextResponse<ApiResult<never>> {
  return NextResponse.json({ ok: false, error, requestId: id }, { status });
}

export function errorFromUnknown(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('AUTH_REQUIRED')) return { code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false };
  if (message.includes('FORBIDDEN')) return { code: 'FORBIDDEN', message: '你无权访问这条记录。', retryable: false };
  if (message.includes('STATE_INVALID')) return { code: 'STATE_INVALID', message: '实验进度已变化，请刷新后重试。', retryable: false };
  if (/timeout|超时/i.test(message)) return { code: 'AI_TIMEOUT', message: '智能体响应超时，回答已经保留，请稍后重试。', retryable: true };
  return { code: 'AI_OUTPUT_INVALID', message: '智能体返回内容未通过校验，请重试。', retryable: true };
}
