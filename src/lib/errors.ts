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

// SDK 上游模型异常（coder-coding-dev-sdk 的 CoderCodingError 体系）。
// 靠 name 识别，不 import SDK 以避免耦合；上游响应 message/data 可能回显密钥/请求上下文，
// 必须不透传原始 message，仅在统一错误边界收敛为安全错误。
const LLM_SDK_ERROR_NAMES = new Set(['APIError', 'NetworkError', 'CoderCodingError', 'ConfigurationError', 'ValidationError']);

export function isLlmSdkError(error: unknown): error is Error {
  return error instanceof Error && LLM_SDK_ERROR_NAMES.has(error.name);
}

export function isLlmNetworkError(error: unknown): boolean {
  return error instanceof Error && error.name === 'NetworkError';
}

/** 提取 SDK 上游错误的有效 HTTP 状态数字；非有限数字返回 null。 */
export function llmSdkErrorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}
