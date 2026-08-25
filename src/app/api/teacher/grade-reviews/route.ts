import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

export async function GET(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (!identity.user.capabilities.teacherWorkspace) return fail({ code: 'FORBIDDEN', message: '仅教师可查看成绩复核。', retryable: false }, undefined, 403);
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data, error } = await supabase
      .from('grade_review_requests')
      .select('id,status,reason,resolution,created_at,grade_components!inner(id,user_id,process_score,contribution_points,status,profiles!grade_components_user_id_fkey(display_name,student_no))')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ok(data ?? []);
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (!identity.user.capabilities.teacherWorkspace) return fail({ code: 'FORBIDDEN', message: '仅教师可处理成绩复核。', retryable: false }, undefined, 403);
  try {
    const body = await request.json() as { requestId?: string; resolution?: string; overrideScore?: number | null; accepted?: boolean };
    if (!body.requestId || !body.resolution?.trim()) {
      return fail({ code: 'VALIDATION_ERROR', message: '复核结论不能为空。', retryable: false }, undefined, 400);
    }
    if (body.overrideScore != null && (!Number.isFinite(body.overrideScore) || body.overrideScore < 0 || body.overrideScore > 100)) {
      return fail({ code: 'VALIDATION_ERROR', message: '调整后成绩必须在0到100之间。', retryable: false }, undefined, 400);
    }
    const { supabase } = createSupabaseRouteClient(request);
    const { data, error } = await supabase.rpc('resolve_grade_review', {
      target_request: body.requestId,
      resolution_text: body.resolution.trim(),
      override_score: body.overrideScore ?? null,
      accepted: body.accepted !== false,
    });
    if (error) throw error;
    return ok(data);
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
