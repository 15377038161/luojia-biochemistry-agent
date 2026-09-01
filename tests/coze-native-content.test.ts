// Coze 原生内容版本契约测试：
// - content_versions 单表双态（published_at 为空为草稿，非空为已发布）
// - 学生开会话写入 content_snapshot 消息（metadata.content_version_id / content_version / source_hash）
// - 快照固定后始终读取该版本内容
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultCourseContent, validateCourseContent } from '@/domain/course-content';
import {
  manifestFromPayload,
  payloadFromManifest,
  ensureContentSnapshot,
  loadSessionContentPayload,
} from '@/lib/services/content';
import { createFakeSupabase, tableCalls } from './helpers/fake-supabase';

test('manifest 与 CourseContentPayload 可无损往返', () => {
  const payload = defaultCourseContent();
  const manifest = manifestFromPayload(payload, ['教材第 3 章'], 'teacher-1', null);
  assert.equal(manifest.status, 'draft');
  assert.equal(manifest.created_by, 'teacher-1');
  assert.equal(manifest.updated_by, 'teacher-1');
  assert.ok(Array.isArray(manifest.source_refs));
  assert.ok(manifest.experiment && manifest.steps && manifest.rubrics);
  const roundTrip = payloadFromManifest(manifest);
  assert.ok(roundTrip, 'manifest 必须能还原为合法 CourseContentPayload');
  const validation = validateCourseContent(roundTrip);
  assert.ok(validation.valid, '还原后的内容必须通过校验');
});

test('学生开会话写入 content_snapshot 消息（含版本与 source_hash）', async () => {
  const { client, calls, pushResponse } = createFakeSupabase();
  pushResponse(null); // 无既有快照
  pushResponse({ id: 'cv-1', version: 3, source_hash: 'hash-1', published_at: '2026-01-01T00:00:00Z', manifest: {} }); // latest published
  pushResponse({ id: 'msg-1' }); // snapshot message insert
  const snapshot = await ensureContentSnapshot(client as never, 'session-1');
  assert.ok(snapshot);
  assert.equal(snapshot.content_version_id, 'cv-1');
  assert.equal(snapshot.content_version, 3);
  assert.equal(snapshot.source_hash, 'hash-1');
  const messageInsert = tableCalls(calls, 'agent_messages').find((call) => call.operation === 'insert');
  assert.ok(messageInsert, '必须写入 content_snapshot 消息');
  const payload = messageInsert.payload as Record<string, unknown>;
  assert.equal(payload.kind, 'content_snapshot');
  const metadata = payload.metadata as Record<string, unknown>;
  assert.equal(metadata.content_version_id, 'cv-1');
  assert.equal(metadata.content_version, 3);
  assert.equal(metadata.source_hash, 'hash-1');
});

test('已有快照时不重复固定版本', async () => {
  const { client, calls, pushResponse } = createFakeSupabase();
  pushResponse({ id: 'msg-1', metadata: { content_version_id: 'cv-9', content_version: 2, source_hash: 'hash-9' } });
  const snapshot = await ensureContentSnapshot(client as never, 'session-1');
  assert.equal(snapshot?.content_version_id, 'cv-9');
  assert.equal(tableCalls(calls, 'agent_messages').filter((call) => call.operation === 'insert').length, 0, '已有快照不得重复写入');
});

test('会话内容读取固定快照版本：教师发布新版不影响历史实验', async () => {
  const payload = defaultCourseContent();
  const manifest = manifestFromPayload(payload, [], 'teacher-1', null);
  const { client, pushResponse } = createFakeSupabase();
  pushResponse({ id: 'msg-1', metadata: { content_version_id: 'cv-1', content_version: 2, source_hash: 'hash-1' } }); // 快照
  pushResponse({ id: 'cv-1', manifest, source_hash: 'hash-1' }); // 按快照版本读取
  const loaded = await loadSessionContentPayload(client as never, 'session-1');
  const validation = validateCourseContent(loaded);
  assert.ok(validation.valid, '会话内容必须来自快照固定版本且合法');
  assert.equal(loaded.title, payload.title);
});

test('无快照且无已发布版本时回退默认内容', async () => {
  const { client, pushResponse } = createFakeSupabase();
  pushResponse(null); // 无快照
  const loaded = await loadSessionContentPayload(client as never, 'session-1');
  const validation = validateCourseContent(loaded);
  assert.ok(validation.valid, '回退内容必须合法');
});
