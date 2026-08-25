import { NextRequest } from 'next/server';
import { fail, ok, errorFromUnknown } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';
import { loadStudentSessionView } from '@/lib/student-session';

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (identity.user.appRole !== 'student') return fail({ code: 'FORBIDDEN', message: '教师身份不能创建学生实验会话。', retryable: false }, undefined, 403);
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data, error } = await supabase.rpc('start_or_resume_student_session');
    if (error) throw error;
    return ok(await loadStudentSessionView(supabase, data, identity.user.profile.displayName));
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}

export async function GET(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data, error } = await supabase.from('agent_sessions').select('id,current_step,completed_at')
      .eq('user_id', identity.user.id).eq('agent_role', 'student').eq('session_mode', 'student')
      .is('completed_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return ok(null);
    return ok(await loadStudentSessionView(supabase, data, identity.user.profile.displayName));
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
