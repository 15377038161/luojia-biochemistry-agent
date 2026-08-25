import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

const CLASS_ID = '10000000-0000-4000-8000-000000000002';
const EXPERIMENT_ID = '10000000-0000-4000-8000-000000000003';

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (!identity.user.capabilities.teacherWorkspace) return fail({ code: 'FORBIDDEN', message: '只有教师可以使用教师分析智能体。', retryable: false }, undefined, 403);
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data: existing } = await supabase.from('agent_sessions').select('id,created_at')
      .eq('user_id', identity.user.id).eq('agent_role', 'teacher').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) return ok(existing);
    const { data, error } = await supabase.from('agent_sessions').insert({
      user_id: identity.user.id,
      experiment_id: EXPERIMENT_ID,
      class_id: CLASS_ID,
      agent_role: 'teacher',
      current_step: null,
    }).select('id,created_at').single();
    if (error) throw error;
    return ok(data);
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
