import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { requireTeacherEvaluationScope } from '@/lib/services/teacher-scope';

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (!identity.user.capabilities.teacherWorkspace) return fail({ code: 'FORBIDDEN', message: '只有教师可以提交复核。', retryable: false }, undefined, 403);
  try {
    const body = (await request.json()) as { evaluationId?: string; decision?: 'confirm' | 'adjust' | 'comment_only'; comment?: string };
    if (!body.evaluationId || !body.decision || !body.comment?.trim()) return fail({ code: 'VALIDATION_ERROR', message: '请选择复核结论并填写意见。', retryable: false });
    await requireTeacherEvaluationScope(getSupabaseAdminClient(), identity.user.id, body.evaluationId);
    const { supabase } = createSupabaseRouteClient(request);
    const { data, error } = await supabase.rpc('record_teacher_review', {
      target_evaluation: body.evaluationId,
      review_decision: body.decision,
      review_comment: body.comment.trim(),
    });
    if (error) throw error;
    return ok(data);
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
