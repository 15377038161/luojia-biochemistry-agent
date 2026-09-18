import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase-auth';

type SyncStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'manual';

export async function GET(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session?.user.capabilities.teacherWorkspace) {
    return NextResponse.json({ error: '无教师工作台权限' }, { status: 403 });
  }

  try {
    const { data, error } = await session.supabase.rpc('sync_outbox_counts');
    if (error) throw error;
    const raw = (data ?? {}) as Record<string, number>;
    const counts: Record<SyncStatus, number> = { pending: 0, processing: 0, succeeded: 0, failed: 0, manual: 0 };
    for (const [status, count] of Object.entries(raw)) {
      if (status in counts) counts[status as SyncStatus] = Number(count);
    }
    return NextResponse.json({ counts, sampled: false });
  } catch {
    return NextResponse.json({ error: '暂时无法读取同步队列状态' }, { status: 503 });
  }
}
