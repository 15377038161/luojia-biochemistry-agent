import { NextRequest, NextResponse } from 'next/server';
import { createDemoLoginToken } from '@/lib/demo-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';
import type { AgentRole } from '@/domain/agent';

export async function GET(request: NextRequest) {
  if (process.env.ENABLE_DEMO_ACCESS !== 'true') return new NextResponse('Not Found', { status: 404 });
  const role: AgentRole = request.nextUrl.searchParams.get('role') === 'teacher' ? 'teacher' : 'student';
  try {
    const tokenHash = await createDemoLoginToken(role);
    const { supabase, applyToResponse } = createSupabaseRouteClient(request);
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (error) throw error;
    return applyToResponse(NextResponse.redirect(new URL('/', request.url)));
  } catch (error) {
    console.error('创建演示身份失败', error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL('/auth/error?reason=session_failed', request.url));
  }
}
