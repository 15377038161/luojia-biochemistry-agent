// AI 输出结构校验失败专用错误；只有该错误（及 sentinel 消息）才能映射为“智能体返回内容未通过校验”。
export class AiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiValidationError';
  }
}

export function isAiValidationError(error: unknown): error is AiValidationError {
  return error instanceof AiValidationError || (error instanceof Error && error.name === 'AiValidationError');
}

export interface SupabaseDatabaseErrorInfo {
  code: string;
  message: string;
}

export function isSupabaseAuthError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AuthError';
}

// PostgrestError / AuthError 均为 { code, message, ... } 结构；仅识别数据库侧错误形态。
export function asSupabaseDatabaseError(error: unknown): SupabaseDatabaseErrorInfo | null {
  if (!error || typeof error !== 'object' || isSupabaseAuthError(error)) return null;
  const candidate = error as Record<string, unknown>;
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  if (!code || !message) return null;
  const looksPostgrest =
    code.startsWith('PGRST') ||
    code === '42501' ||
    /^[0-9A-Z]{5}$/.test(code) ||
    'details' in candidate ||
    'hint' in candidate;
  if (!looksPostgrest) return null;
  return { code, message };
}

export function asNetworkError(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error.name === 'AiValidationError') return null;
  const text = `${error.name}: ${error.message}`;
  if (/fetch failed|network|ECONN[A-Z]+|socket hang up|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|UND_ERR/i.test(text)) {
    return error.message || '网络异常';
  }
  return null;
}

export function asTimeoutError(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (/智能体请求超时|AI_TIMEOUT|Request timed out|timeout of \d+ms exceeded|AbortError|signal timed out/i.test(error.message)) {
    return error.message || '智能体响应超时，请重试';
  }
  return null;
}
