import { getSupabaseAdminClient } from '@/lib/supabase-client';

interface OutboxRow {
  id: string;
  event_id: string;
  payload: Record<string, unknown>;
  attempt_count: number;
}

const CHAOXING_FORM_FIELDS = [
  'student_id', 'step_id', 'version_no', 'student_answer', 'ai_feedback', 'gate_status',
  'total_score', 'ai_confidence', 'evidence_image', 'teacher_comment', 'final_report',
] as const;

export const CHAOXING_FORM_ID = '3513491';
export type ChaoxingFormTransport = 'taskflow' | 'api' | 'disabled';

export interface ChaoxingFormConfig {
  formId: string;
  transport: ChaoxingFormTransport;
  writeUrl: string;
  token: string;
  readbackUrl: string;
  rateLimitPerSecond: number;
  configurationError?: string;
}

export interface ChaoxingFormRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ChaoxingWriteResult {
  externalRecordId?: string;
  raw?: unknown;
}

function asTransport(value: string | undefined): ChaoxingFormTransport {
  if (value === 'taskflow' || value === 'api' || value === 'disabled') return value;
  return 'disabled';
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getChaoxingFormConfig(env: Record<string, string | undefined> = process.env): ChaoxingFormConfig {
  const writeUrl = env.CHAOXING_FORM_WRITE_URL?.trim() || '';
  const token = env.CHAOXING_FORM_WRITE_TOKEN?.trim() || '';
  const configuredTransport = env.CHAOXING_FORM_TRANSPORT?.trim();
  const transport = configuredTransport ? asTransport(configuredTransport) : 'disabled';
  const configurationError = configuredTransport && !['taskflow', 'api', 'disabled'].includes(configuredTransport)
    ? 'CHAOXING_FORM_TRANSPORT 必须是 taskflow、api 或 disabled'
    : undefined;

  return {
    formId: env.CHAOXING_FORM_ID?.trim() || CHAOXING_FORM_ID,
    transport,
    writeUrl,
    token,
    readbackUrl: env.CHAOXING_FORM_READBACK_URL?.trim() || '',
    rateLimitPerSecond: positiveNumber(env.CHAOXING_FORM_RATE_LIMIT, 0),
    configurationError,
  };
}

export function getChaoxingFormConfigurationStatus(env: Record<string, string | undefined> = process.env) {
  const config = getChaoxingFormConfig(env);
  if (config.configurationError) return { state: 'error' as const, detail: config.configurationError, config };
  if (config.transport === 'disabled') return { state: 'pending' as const, detail: '未配置正式任务流/API，事件只保存在 outbox', config };
  if (!config.writeUrl || !config.token) return { state: 'pending' as const, detail: '传输方式已选择，但写入地址或鉴权未配置', config };
  return { state: 'configured' as const, detail: `${config.transport === 'taskflow' ? '任务流' : '正式 API'}已配置，需 TEST_ 写入并回查后启用`, config };
}

export function mapChaoxingFormFields(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(CHAOXING_FORM_FIELDS.flatMap((field) => {
    const value = payload[field];
    return value === undefined || value === null ? [] : [[field, value] as const];
  }));
}

export function buildChaoxingFormRequest(
  row: Pick<OutboxRow, 'event_id' | 'payload'>,
  config: ChaoxingFormConfig = getChaoxingFormConfig(),
): ChaoxingFormRequest {
  if (config.transport === 'disabled') throw new Error('SYNC_DISABLED');
  if (config.configurationError || !config.writeUrl || !config.token) throw new Error('SYNC_CONFIG_INVALID');
  return {
    url: config.writeUrl,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': row.event_id,
    },
    body: JSON.stringify({ formId: config.formId, fields: mapChaoxingFormFields(row.payload) }),
  };
}

export function normalizeChaoxingWriteResponse(value: unknown): ChaoxingWriteResult {
  if (!value || typeof value !== 'object') return { raw: value };
  const record = value as Record<string, unknown>;
  const candidate = record.externalRecordId ?? record.external_record_id ?? record.recordId ?? record.record_id ?? record.id;
  return { externalRecordId: typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : undefined, raw: value };
}

export interface ChaoxingHealthResult {
  state: 'ready' | 'pending' | 'error';
  detail: string;
  transport: ChaoxingFormTransport;
}

export async function checkChaoxingFormHealth(
  config: ChaoxingFormConfig = getChaoxingFormConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<ChaoxingHealthResult> {
  if (config.configurationError) return { state: 'error', detail: config.configurationError, transport: config.transport };
  if (config.transport === 'disabled') return { state: 'pending', detail: '未启用超星传输适配器', transport: config.transport };
  if (!config.writeUrl || !config.token) return { state: 'pending', detail: '写入地址或鉴权未配置', transport: config.transport };

  const url = config.readbackUrl || config.writeUrl;
  const method = config.readbackUrl ? 'GET' : 'OPTIONS';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${config.token}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return { state: 'error', detail: `健康检查返回 HTTP ${response.status}`, transport: config.transport };
    return {
      state: config.readbackUrl ? 'ready' : 'pending',
      detail: config.readbackUrl ? '回查接口可访问，已通过连通性检查' : '写入地址可访问，仍需 TEST_ 写入与回查确认契约',
      transport: config.transport,
    };
  } catch (error) {
    return { state: 'error', detail: error instanceof Error ? error.message : '健康检查失败', transport: config.transport };
  } finally {
    clearTimeout(timeout);
  }
}

export function backoffMinutes(attempt: number): number {
  return Math.min(360, 2 ** Math.min(attempt, 8));
}

async function sendToChaoxing(row: OutboxRow, config: ChaoxingFormConfig): Promise<ChaoxingWriteResult> {
  const request = buildChaoxingFormRequest(row, config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      const error = new Error(`HTTP_${response.status}:${detail}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('json') ? normalizeChaoxingWriteResponse(await response.json()) : {};
  } finally { clearTimeout(timeout); }
}

async function waitForRateLimit(lastSentAt: number, rateLimitPerSecond: number): Promise<void> {
  if (!rateLimitPerSecond || !lastSentAt) return;
  const waitMs = Math.ceil(1000 / rateLimitPerSecond) - (Date.now() - lastSentAt);
  if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
}

async function verifyChaoxingReadback(config: ChaoxingFormConfig, fetchImpl: typeof fetch): Promise<{ verified: boolean; at: string | null }> {
  if (!config.readbackUrl) return { verified: false, at: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(config.readbackUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.token}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    return { verified: response.ok, at: response.ok ? new Date().toISOString() : null };
  } catch {
    return { verified: false, at: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function processChaoxingOutbox(limit = 20) {
  const admin = getSupabaseAdminClient();
  const config = getChaoxingFormConfig();
  const { data, error } = await admin.from('sync_outbox').select('id,event_id,payload,attempt_count')
    .eq('status', 'pending').lte('next_attempt_at', new Date().toISOString()).order('created_at').limit(limit);
  if (error) throw error;
  const result = { processed: 0, succeeded: 0, deferred: 0, manual: 0 };
  let lastSentAt = 0;
  for (const row of (data || []) as OutboxRow[]) {
    result.processed += 1;
    await admin.from('sync_outbox').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'pending');
    try {
      await waitForRateLimit(lastSentAt, config.rateLimitPerSecond);
      const writeResult = await sendToChaoxing(row, config);
      lastSentAt = Date.now();
      const readback = await verifyChaoxingReadback(config, fetch);
      await admin.from('sync_outbox').update(buildSucceededSyncUpdate(row, writeResult.externalRecordId ?? null, readback)).eq('id', row.id);
      result.succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = (error as Error & { status?: number }).status;
      if (message === 'SYNC_DISABLED') {
        await admin.from('sync_outbox').update({ status: 'pending', last_error: '接口未授权，等待配置', next_attempt_at: new Date(Date.now() + 3600_000).toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id);
        result.deferred += 1;
      } else if (status && status >= 400 && status < 500 && status !== 429) {
        await admin.from('sync_outbox').update({ status: 'manual', attempt_count: row.attempt_count + 1, last_error: message, updated_at: new Date().toISOString() }).eq('id', row.id);
        result.manual += 1;
      } else {
        const attempt = row.attempt_count + 1;
        await admin.from('sync_outbox').update({ status: attempt >= 8 ? 'failed' : 'pending', attempt_count: attempt, last_error: message, next_attempt_at: new Date(Date.now() + backoffMinutes(attempt) * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id);
        result.deferred += 1;
      }
    }
  }
  return result;
}

// 外部记录编号统一保存在 payload.external_record_id（正式模型没有独立的
// external_record_id 列），同步成功后把回执信息合并写回 payload。
export function buildSucceededSyncUpdate(
  row: OutboxRow,
  externalRecordId: string | null,
  readback: { verified: boolean; at: string | null },
): Record<string, unknown> {
  const existingPayload = (row.payload ?? {}) as Record<string, unknown>;
  const payload: Record<string, unknown> = {
    ...existingPayload,
    submitted_at: new Date().toISOString(),
    readback_verified: readback.verified,
    readback_at: readback.at,
  };
  if (externalRecordId) payload.external_record_id = externalRecordId;
  return {
    status: 'succeeded',
    attempt_count: row.attempt_count + 1,
    payload,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
}
