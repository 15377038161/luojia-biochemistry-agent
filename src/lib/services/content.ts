import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  defaultCourseContent,
  validateCourseContent,
  type CourseContentPayload,
} from '@/domain/course-content';
import type { DimensionScores } from '@/domain/agent';
import { EXPERIMENT_ID } from '@/lib/services/sessions';

export { EXPERIMENT_ID };

export const CONTENT_SNAPSHOT_KIND = 'content_snapshot';

const VERSION_COLUMNS = 'id,experiment_id,version,manifest,source_hash,published_at,created_at';

export interface ContentVersionRow {
  id: string;
  experiment_id: string;
  version: number;
  manifest: ContentVersionManifest | null;
  source_hash: string;
  published_at: string | null;
  created_at: string | null;
}

export interface ContentManifestRubrics {
  dimensions: Array<{ key: keyof DimensionScores; label: string; max: number }>;
}

export interface ContentVersionManifest {
  experiment: {
    schemaVersion: CourseContentPayload['schemaVersion'];
    title: string;
    targetProtein: CourseContentPayload['targetProtein'];
    primaryStrategy: CourseContentPayload['primaryStrategy'];
    alternativeStrategy: CourseContentPayload['alternativeStrategy'];
    assets: CourseContentPayload['assets'];
  };
  steps: CourseContentPayload['steps'];
  rubrics: ContentManifestRubrics;
  source_refs: string[];
  editor_metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  status: 'draft' | 'published';
}

export interface DraftRecord {
  id: string;
  version: number;
  status: 'draft' | 'published';
  updated_at: string | null;
}

export interface ContentSnapshot {
  content_version_id: string;
  content_version: number;
  source_hash: string;
}

const DEFAULT_RUBRICS: ContentManifestRubrics = {
  dimensions: [
    { key: 'knowledge', label: '知识理解', max: 20 },
    { key: 'operation', label: '操作描述', max: 20 },
    { key: 'decision', label: '科学决策', max: 20 },
    { key: 'troubleshooting', label: '问题解决', max: 20 },
    { key: 'analysis', label: '结果分析与判断', max: 20 },
  ],
};

export function manifestFromPayload(
  payload: CourseContentPayload,
  sourceRefs: string[],
  userId: string,
  base: ContentVersionManifest | null,
): ContentVersionManifest {
  return {
    experiment: {
      schemaVersion: payload.schemaVersion,
      title: payload.title,
      targetProtein: payload.targetProtein,
      primaryStrategy: payload.primaryStrategy,
      alternativeStrategy: payload.alternativeStrategy,
      assets: payload.assets,
    },
    steps: payload.steps,
    rubrics: base?.rubrics ?? DEFAULT_RUBRICS,
    source_refs: sourceRefs,
    editor_metadata: {
      ...(base?.editor_metadata ?? {}),
      savedAt: new Date().toISOString(),
    },
    created_by: base?.created_by ?? userId,
    updated_by: userId,
    status: 'draft',
  };
}

export function payloadFromManifest(value: unknown): CourseContentPayload | null {
  if (!value || typeof value !== 'object') return null;
  const manifest = value as Partial<ContentVersionManifest>;
  if (!manifest.experiment || !Array.isArray(manifest.steps)) return null;
  const payload: CourseContentPayload = {
    schemaVersion: manifest.experiment.schemaVersion,
    title: manifest.experiment.title,
    targetProtein: manifest.experiment.targetProtein,
    primaryStrategy: manifest.experiment.primaryStrategy,
    alternativeStrategy: manifest.experiment.alternativeStrategy,
    steps: manifest.steps,
    assets: manifest.experiment.assets ?? [],
  };
  const validation = validateCourseContent(payload);
  return validation.valid ? payload : null;
}

export function hashManifest(manifest: ContentVersionManifest): string {
  const canonical = JSON.stringify({
    experiment: manifest.experiment,
    steps: manifest.steps,
    rubrics: manifest.rubrics,
    source_refs: manifest.source_refs,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function draftRecord(row: ContentVersionRow): DraftRecord {
  const savedAt = row.manifest?.editor_metadata?.savedAt;
  return {
    id: row.id,
    version: row.version,
    status: row.published_at ? 'published' : 'draft',
    updated_at: typeof savedAt === 'string' ? savedAt : row.created_at,
  };
}

export async function findLatestPublishedVersion(supabase: SupabaseClient, experimentId = EXPERIMENT_ID) {
  return supabase
    .from('content_versions')
    .select(VERSION_COLUMNS)
    .eq('experiment_id', experimentId)
    .not('published_at', 'is', null)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function findCurrentDraft(supabase: SupabaseClient, experimentId = EXPERIMENT_ID) {
  return supabase
    .from('content_versions')
    .select(VERSION_COLUMNS)
    .eq('experiment_id', experimentId)
    .is('published_at', null)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function findContentVersionById(supabase: SupabaseClient, versionId: string) {
  return supabase
    .from('content_versions')
    .select(VERSION_COLUMNS)
    .eq('id', versionId)
    .maybeSingle();
}

export async function nextVersionNumber(supabase: SupabaseClient, experimentId = EXPERIMENT_ID): Promise<number> {
  const { data, error } = await supabase
    .from('content_versions')
    .select('version')
    .eq('experiment_id', experimentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.version ?? 0) + 1;
}

export async function saveContentDraft(
  supabase: SupabaseClient,
  payload: CourseContentPayload,
  sourceRefs: string[],
  userId: string,
  draftId?: string,
): Promise<ContentVersionRow> {
  const validation = validateCourseContent(payload);
  if (!validation.valid) throw new Error(`内容校验未通过：${validation.errors.join('；')}`);

  if (draftId) {
    const { data: existing, error } = await findContentVersionById(supabase, draftId);
    if (error) throw error;
    if (!existing || existing.published_at) throw new Error('STATE_INVALID');
    const manifest = manifestFromPayload(payload, sourceRefs, userId, existing.manifest ?? null);
    const { data: updated, error: updateError } = await supabase
      .from('content_versions')
      .update({ manifest, source_hash: hashManifest(manifest) })
      .eq('id', draftId)
      .is('published_at', null)
      .select(VERSION_COLUMNS)
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error('STATE_INVALID');
    return updated;
  }

  const version = await nextVersionNumber(supabase);
  const manifest = manifestFromPayload(payload, sourceRefs, userId, null);
  const { data: inserted, error: insertError } = await supabase
    .from('content_versions')
    .insert({
      experiment_id: EXPERIMENT_ID,
      version,
      manifest,
      source_hash: hashManifest(manifest),
    })
    .select(VERSION_COLUMNS)
    .single();
  if (insertError) throw insertError;
  return inserted;
}

export async function publishContentDraft(supabase: SupabaseClient, draftId: string): Promise<ContentVersionRow> {
  const { data: existing, error } = await findContentVersionById(supabase, draftId);
  if (error) throw error;
  if (!existing || existing.published_at) throw new Error('STATE_INVALID');
  if (!payloadFromManifest(existing.manifest)) {
    throw new Error('发布前校验未通过，内容不符合课程契约。');
  }

  const { data: published, error: publishError } = await supabase
    .from('content_versions')
    .update({ published_at: new Date().toISOString() })
    .eq('id', draftId)
    .is('published_at', null)
    .select(VERSION_COLUMNS)
    .single();
  if (publishError) throw publishError;
  return published;
}

export async function findContentSnapshot(supabase: SupabaseClient, sessionId: string): Promise<ContentSnapshot | null> {
  const { data, error } = await supabase
    .from('agent_messages')
    .select('metadata')
    .eq('session_id', sessionId)
    .eq('kind', CONTENT_SNAPSHOT_KIND)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const metadata = data?.metadata as Record<string, unknown> | null;
  if (!metadata || typeof metadata.content_version_id !== 'string') return null;
  return {
    content_version_id: metadata.content_version_id,
    content_version: Number(metadata.content_version ?? 0),
    source_hash: typeof metadata.source_hash === 'string' ? metadata.source_hash : '',
  };
}

export async function ensureContentSnapshot(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<ContentSnapshot | null> {
  const existing = await findContentSnapshot(supabase, sessionId);
  if (existing) return existing;

  const { data: published, error } = await findLatestPublishedVersion(supabase);
  if (error) throw error;
  if (!published) return null;

  const snapshot: ContentSnapshot = {
    content_version_id: published.id,
    content_version: published.version,
    source_hash: published.source_hash,
  };
  const { error: messageError } = await supabase.from('agent_messages').insert({
    session_id: sessionId,
    role: 'system',
    kind: CONTENT_SNAPSHOT_KIND,
    step_no: null,
    content: `已固定实验内容版本 V${published.version}；后续发布的新版本不会影响本会话。`,
    metadata: snapshot,
  });
  if (messageError) throw messageError;
  return snapshot;
}

export async function loadSessionContentPayload(supabase: SupabaseClient, sessionId: string) {
  const snapshot = await ensureContentSnapshot(supabase, sessionId);
  if (!snapshot) return defaultCourseContent();
  const { data: row, error } = await findContentVersionById(supabase, snapshot.content_version_id);
  if (error) throw error;
  return payloadFromManifest(row?.manifest ?? null) ?? defaultCourseContent();
}

export function toDraftRecord(row: ContentVersionRow | null): DraftRecord | null {
  return row ? draftRecord(row) : null;
}
