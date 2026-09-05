import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { getSessionUser } from '@/lib/supabase-auth';
import { ok, fail, errorFromUnknown } from '@/lib/api-result';
import type { QuizQuestion } from '@/lib/coze-workflows';

/** 仅返回当前学生自己的已完成测验，供题库耗尽时回顾。 */
export async function GET(req: NextRequest) {
  try {
    const identity = await getSessionUser(req.cookies);
    if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
    const stepNo = Number(req.nextUrl.searchParams.get('stepNo'));
    if (!Number.isInteger(stepNo) || stepNo < 1 || stepNo > 8) return fail({ code: 'VALIDATION_ERROR', message: 'stepNo 必须是1—8。', retryable: false }, undefined, 400);
    const { data, error } = await getSupabaseAdminClient().from('quiz_sessions')
      .select('id, questions, answers, results, status, created_at, graded_at, submitted_at')
      .eq('user_id', identity.user.id).eq('step_no', stepNo).neq('status', 'in_progress')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return ok({ history: null });
    return ok({ history: { session_id: data.id, questions: data.questions as QuizQuestion[], answers: data.answers || {}, results: data.results || [], status: data.status, created_at: data.created_at, submitted_at: data.submitted_at, graded_at: data.graded_at } });
  } catch (error) { return fail(errorFromUnknown(error)); }
}
