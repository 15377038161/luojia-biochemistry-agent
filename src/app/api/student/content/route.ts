import { NextResponse, type NextRequest } from 'next/server';
import { fail, ok, errorFromUnknown } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { loadSessionContentPayload } from '@/lib/services/content';

export async function GET(request: NextRequest) {
  try {
    const identity = await getSessionUser(request.cookies);
    if (!identity) return fail({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED' }, undefined, 401);
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      return fail({ code: 'VALIDATION_ERROR', message: '缺少 sessionId 参数。' }, undefined, 400);
    }
    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error } = await supabase
      .from('agent_sessions')
      .select('id,user_id,agent_role')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session || session.user_id !== identity.user.id) {
      return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN' }, undefined, 403);
    }
    if (session.agent_role !== 'student') {
      return fail({ code: 'FORBIDDEN', message: '教师体验会话不加载学生实验内容。' }, undefined, 403);
    }
    const admin = getSupabaseAdminClient();
    const payload = await loadSessionContentPayload(admin, sessionId);
    return ok(payload);
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
