import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok, requestId } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';
import { loadStudentSessionView } from '@/lib/student-session';
import { ensureContentSnapshot } from '@/lib/services/content';
import { getSupabaseAdminClient } from '@/lib/supabase-client';

export async function GET(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data, error } = await supabase
      .from('agent_sessions')
      .select('*, step_states(*), agent_messages(*)')
      .eq('user_id', identity.user.id)
      .eq('agent_role', 'student')
      .is('completed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return ok(null);
    return ok(await loadStudentSessionView(supabase, data, identity.user.profile.displayName ?? '学生'));
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (identity.user.appRole !== 'student') {
    return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN' }, undefined, 403);
  }
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data, error } = await supabase.rpc('start_or_resume_student_session');
    if (error) throw error;
    const session = data as { id: string; current_step: number | null; completed_at: string | null } | null;
    if (!session) return fail({ code: 'RESOURCE_MISSING', message: '无法开始实验会话，请确认课程授权。', retryable: true }, undefined, 502);
    // 会话开始后固化内容版本快照；失败不影响会话恢复（读取侧有默认内容兜底）
    try {
      await ensureContentSnapshot(getSupabaseAdminClient(), session.id);
    } catch (snapshotError) {
      console.error('[student-session] content snapshot failed', snapshotError);
    }
    return ok(await loadStudentSessionView(supabase, session, identity.user.profile.displayName ?? '学生'));
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
