import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase-auth';
import { getIntegrationStatus } from '@/lib/integration-status';

export async function GET(request: NextRequest) {
  const session = await getSessionUser(request.cookies);
  if (!session) {
    return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 });
  }

  return NextResponse.json({
    user: session.user,
    capabilities: session.user.capabilities,
    defaultWorkspace: session.user.defaultWorkspace,
    integrations: getIntegrationStatus(),
  });
}
