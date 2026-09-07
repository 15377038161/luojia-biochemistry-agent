import { AiValidationError } from '@/lib/errors';

export type AiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AiContentPart[];
}

export type AiWorkload = 'quality' | 'fast';

interface InvokeOptions {
  workload?: AiWorkload;
  temperature?: number;
  maxTokens?: number;
  deepThinking?: boolean;
}

interface GatewayResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: { message?: string };
}

const DEFAULT_CHAT_URL = 'http://wg.cxcommon.com/fw/v1/chat/completions';
const QUALITY_MODEL = 'qwen3.8-max';
const FAST_MODEL = 'deepseek-v4-flash-0731';

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function gatewayConfig() {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY_MISSING');
  return {
    apiKey,
    chatUrl: process.env.AI_GATEWAY_CHAT_URL?.trim() || DEFAULT_CHAT_URL,
    qualityModel: process.env.AI_MODEL_QUALITY?.trim() || QUALITY_MODEL,
    fastModel: process.env.AI_MODEL_FAST?.trim() || FAST_MODEL,
    timeoutMs: positiveInteger(process.env.AI_GATEWAY_TIMEOUT_MS, 45_000),
    retryCount: Math.min(2, positiveInteger(process.env.AI_GATEWAY_RETRY_COUNT, 1)),
  };
}

function responseText(payload: GatewayResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content.map((part) => part.text || '').join('').trim();
    if (text) return text;
  }
  throw new AiValidationError('模型网关未返回可解析的文本内容');
}

async function requestGateway(
  messages: AiMessage[],
  options: Required<Pick<InvokeOptions, 'temperature' | 'maxTokens' | 'deepThinking'>> & { model: string },
  allowThinkingField: boolean,
): Promise<string> {
  const config = gatewayConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('AI_TIMEOUT')), config.timeoutMs);
  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
  };
  if (options.deepThinking && allowThinkingField) body.enable_thinking = true;

  try {
    const response = await fetch(config.chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as GatewayResponse;
    if (!response.ok) {
      const message = payload.error?.message || `HTTP ${response.status}`;
      const error = new Error(`模型网关请求失败：${message}`);
      error.name = response.status >= 500 || response.status === 429 ? 'NetworkError' : 'AiGatewayError';
      Object.assign(error, { status: response.status });
      throw error;
    }
    return responseText(payload);
  } finally {
    clearTimeout(timer);
  }
}

function isThinkingFieldError(error: unknown): boolean {
  return error instanceof Error
    && Number((error as Error & { status?: number }).status) === 400
    && /thinking|unknown field|extra field|unsupported/i.test(error.message);
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'NetworkError' || /AI_TIMEOUT|AbortError|fetch failed/i.test(`${error.name}:${error.message}`);
}

export async function invokeAi(messages: AiMessage[], options: InvokeOptions = {}): Promise<{ content: string; model: string }> {
  const config = gatewayConfig();
  const model = options.workload === 'fast' ? config.fastModel : config.qualityModel;
  const normalized = {
    model,
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? (options.workload === 'fast' ? 4_000 : 16_000),
    deepThinking: options.deepThinking ?? false,
  };

  let allowThinkingField = normalized.deepThinking;
  let lastError: unknown;
  for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
    try {
      const content = await requestGateway(messages, normalized, allowThinkingField);
      return { content, model };
    } catch (error) {
      lastError = error;
      if (allowThinkingField && isThinkingFieldError(error)) {
        allowThinkingField = false;
        continue;
      }
      if (!isRetryable(error) || attempt === config.retryCount) throw error;
    }
  }
  throw lastError;
}

export const AI_MODEL_DEFAULTS = {
  quality: QUALITY_MODEL,
  fast: FAST_MODEL,
} as const;
