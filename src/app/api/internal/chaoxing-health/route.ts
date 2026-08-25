import { NextRequest, NextResponse } from 'next/server';
import { checkChaoxingFormHealth } from '@/lib/chaoxing-sync';

export async function GET(request: NextRequest) {
  const expected = process.env.SYNC_WORKER_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || !supplied || supplied !== expected) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '同步Worker鉴权失败。' }, { status: 403 });
  }

  const health = await checkChaoxingFormHealth();
  return NextResponse.json(health, { status: health.state === 'error' ? 503 : 200 });
}
