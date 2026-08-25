import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

export async function GET(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  const sessionId = request.nextUrl.searchParams.get('sessionId')?.trim();
  if (!sessionId) return fail({ code: 'VALIDATION_ERROR', message: '缺少会话编号。', retryable: false }, undefined, 400);

  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data, error } = await supabase.rpc('refresh_grade_component', { target_session: sessionId });
    if (error) throw error;
    const { data: review, error: reviewError } = await supabase
      .from('grade_review_requests')
      .select('id,status,reason,resolution,created_at,resolved_at')
      .eq('grade_component_id', data.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reviewError) throw reviewError;
    return ok({ ...data, review });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const body = await request.json() as { gradeId?: string; reason?: string };
    if (!body.gradeId || !body.reason || body.reason.trim().length < 10) {
      return fail({ code: 'VALIDATION_ERROR', message: '请用至少10个字说明复核理由。', retryable: false }, undefined, 400);
    }
    const { supabase } = createSupabaseRouteClient(request);
    const { data, error } = await supabase.rpc('submit_grade_review', {
      target_grade: body.gradeId,
      review_reason: body.reason.trim(),
    });
    if (error) throw error;
    return ok(data);
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
