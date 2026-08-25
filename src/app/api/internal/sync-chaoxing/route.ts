import { NextRequest } from 'next/server';
import { processChaoxingOutbox } from '@/lib/chaoxing-sync';
import { fail, ok } from '@/lib/api-result';

export async function POST(request: NextRequest) {
  const expected = process.env.SYNC_WORKER_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || !supplied || supplied !== expected) return fail({ code: 'FORBIDDEN', message: '同步Worker鉴权失败。', retryable: false }, undefined, 403);
  try { return ok(await processChaoxingOutbox()); }
  catch { return fail({ code: 'SYNC_DEFERRED', message: '同步任务暂未完成。', retryable: true }, undefined, 503); }
}
