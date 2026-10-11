import { LLMClient, Config } from 'coder-coding-dev-sdk';
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

// 内置模型映射（由平台注入，无需外部密钥）。
// doubao-seed 支持视觉与深度思考，用于 quality 及一切含图/复杂推理场景；
// deepseek-v4-flash 用于 fast 纯文本场景，追求低延迟。
const QUALITY_MODEL = 'doubao-seed-1-8-251228';
const FAST_MODEL = 'deepseek-v4-flash';

// 平台代理模型最大输出为 8K token，超过该值需收敛，避免请求被拒。
const MAX_OUTPUT_TOKENS = 8_000;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clampMaxTokens(value: number): number {
  const min = Math.max(1, positiveInteger(process.env.AI_MIN_TOKENS, 256));
  return Math.max(min, Math.min(MAX_OUTPUT_TOKENS, value));
}

// 重试预算：AI_GATEWAY_RETRY_COUNT 控制失败重试次数，缺省 3，允许 0（避免慢评阅跨越平台请求窗口）。
// 非法/越界配置明确报错而非静默回退；重试仅由 SDK 内部完成，业务层不叠加（避免乘法重试）。
const DEFAULT_RETRY_TIMES = 3;
const MAX_RETRY_TIMES = 5;

function resolveRetryTimes(): number {
  const raw = process.env.AI_GATEWAY_RETRY_COUNT;
  if (raw === undefined || raw.trim() === '') return DEFAULT_RETRY_TIMES;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`AI_GATEWAY_RETRY_COUNT 必须是非负整数，当前值 "${raw}"`);
  }
  if (parsed > MAX_RETRY_TIMES) {
    throw new Error(`AI_GATEWAY_RETRY_COUNT 超出上界 ${MAX_RETRY_TIMES}，当前值 "${raw}"`);
  }
  return parsed;
}

/** 每次按当前环境变量解析重试预算，保证运行时配置即时生效（避免单例缓存导致配置不生效）。 */
function getClient(): LLMClient {
  return new LLMClient(new Config({ retryTimes: resolveRetryTimes() }));
}

/** 判断消息是否包含图像，含图时必须走支持视觉的 quality 模型。 */
function containsImage(messages: AiMessage[]): boolean {
  return messages.some(
    (message) => Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url'),
  );
}

/**
 * 通过平台内置大模型完成一次非流式对话。
 * 兼容原外部网关的调用签名，返回 { content, model }，供 coze-workflows / teacher-agent 复用。
 */
export async function invokeAi(
  messages: AiMessage[],
  options: InvokeOptions = {},
): Promise<{ content: string; model: string }> {
  const workload = options.workload ?? 'quality';
  // 含图请求强制走视觉模型；否则按 workload 选择。
  const model = containsImage(messages) || workload !== 'fast' ? QUALITY_MODEL : FAST_MODEL;
  const temperature = options.temperature ?? 0.2;
  const maxTokens = clampMaxTokens(options.maxTokens ?? (workload === 'fast' ? 4_000 : 8_000));

  const response = await getClient().invoke(messages, {
    model,
    temperature,
    maxTokens,
    thinking: options.deepThinking ? 'enabled' : 'disabled',
  });

  const content = response.content?.trim();
  if (!content) throw new AiValidationError('内置模型未返回可解析的文本内容');
  return { content, model };
}

export const AI_MODEL_DEFAULTS = {
  quality: QUALITY_MODEL,
  fast: FAST_MODEL,
} as const;
