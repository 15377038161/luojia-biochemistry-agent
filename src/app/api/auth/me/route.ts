import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase-auth';
import { getIntegrationStatus } from '@/lib/integration-status';

export async function GET(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 });
  }

  // [TEMP-DIAG] 诊断平台 OAuth 登录后原始 metadata（定位教师角色来源），验证后移除
  const rawMetadata = await session.supabase.auth.getUser();

  return NextResponse.json({
    user: session.user,
    capabilities: session.user.capabilities,
    defaultWorkspace: session.user.defaultWorkspace,
    integrations: getIntegrationStatus(),
    _diag: {
      app_metadata: rawMetadata.data.user?.app_metadata ?? null,
      user_metadata: rawMetadata.data.user?.user_metadata ?? null,
    },
  });
}
