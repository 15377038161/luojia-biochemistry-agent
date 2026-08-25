import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase-auth';
import { getSupabaseAdminClient } from '@/lib/supabase-client';

type SyncStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'manual';

export async function GET(request: NextRequest) {
  const session = await getSessionUser(request.cookies);
  if (!session?.user.capabilities.teacherWorkspace) {
    return NextResponse.json({ error: '无教师工作台权限' }, { status: 403 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from('sync_outbox').select('status').limit(5000);
    if (error) throw error;
    const counts: Record<SyncStatus, number> = { pending: 0, processing: 0, succeeded: 0, failed: 0, manual: 0 };
    for (const row of (data || []) as Array<{ status: string }>) {
      if (row.status in counts) counts[row.status as SyncStatus] += 1;
    }
    return NextResponse.json({ counts, sampled: (data || []).length >= 5000 });
  } catch {
    return NextResponse.json({ error: '暂时无法读取同步队列状态' }, { status: 503 });
  }
}
