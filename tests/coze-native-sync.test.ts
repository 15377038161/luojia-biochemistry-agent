import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSucceededSyncUpdate } from '../src/lib/chaoxing-sync';

interface OutboxRowLike {
  id: string;
  event_id: string;
  payload: Record<string, unknown>;
  attempt_count: number;
}

const row: OutboxRowLike = {
  id: 'outbox-1',
  event_id: 'event-1',
  attempt_count: 1,
  payload: { student_id: 'student-1', step_id: 3 },
};

test('同步成功后外部记录编号写入 payload.external_record_id，而非独立列', () => {
  const update = buildSucceededSyncUpdate(row as never, 'EXT-9988', { verified: true, at: '2026-01-01T00:00:00.000Z' });
  assert.equal('external_record_id' in update, false, 'sync_outbox 不再有独立 external_record_id 列写入');
  const payload = update.payload as Record<string, unknown>;
  assert.equal(payload.external_record_id, 'EXT-9988');
  assert.equal(payload.student_id, 'student-1', '原 payload 字段保留');
  assert.equal(payload.submitted_at !== undefined, true);
  assert.equal(payload.readback_verified, true);
  assert.equal(payload.readback_at, '2026-01-01T00:00:00.000Z');
  assert.equal(update.status, 'succeeded');
  assert.equal(update.attempt_count, 2);
});

test('外部系统未回执编号时不写入 external_record_id，但保留回执状态', () => {
  const update = buildSucceededSyncUpdate(row as never, null, { verified: false, at: null });
  const payload = update.payload as Record<string, unknown>;
  assert.equal('external_record_id' in payload, false);
  assert.equal(payload.readback_verified, false);
});

test('重试场景保留既有 payload 中的 external_record_id', () => {
  const retryRow: OutboxRowLike = { ...row, payload: { ...row.payload, external_record_id: 'EXT-0001' } };
  const update = buildSucceededSyncUpdate(retryRow as never, null, { verified: true, at: '2026-01-02T00:00:00.000Z' });
  const payload = update.payload as Record<string, unknown>;
  assert.equal(payload.external_record_id, 'EXT-0001', '已存在的外部记录编号必须保留供回查');
});
