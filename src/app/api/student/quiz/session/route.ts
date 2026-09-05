import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { getSessionUser } from '@/lib/supabase-auth';
import { ok, fail, errorFromUnknown } from '@/lib/api-result';
import { publicQuizSession, validateQuizAnswers } from '@/lib/quiz-contract';

export async function GET(req: NextRequest) {
  try {
    const identity = await getSessionUser(req.cookies);
    if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
    const id = req.nextUrl.searchParams.get('session_id');
    if (!id) return fail({ code: 'VALIDATION_ERROR', message: 'session_id 必填', retryable: false });
    const { data, error } = await getSupabaseAdminClient().from('quiz_sessions')
      .select('id,questions,answers,results,status,step_no').eq('id', id).eq('user_id', identity.user.id).maybeSingle();
    if (error) throw error;
    if (!data) return fail({ code: 'RESOURCE_MISSING', message: '测验不存在或无权访问。', retryable: false }, undefined, 404);
    return ok({ ...publicQuizSession(data), stepNo: data.step_no });
  } catch (error) { return fail(errorFromUnknown(error)); }
}

export async function PATCH(req: NextRequest) {
  try {
    const identity = await getSessionUser(req.cookies);
    if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
    const body = await req.json() as { session_id?: string; answers?: unknown };
    if (typeof body.session_id !== 'string') return fail({ code: 'VALIDATION_ERROR', message: '测验编号无效。', retryable: false });
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from('quiz_sessions').select('id,questions,status')
      .eq('id', body.session_id).eq('user_id', identity.user.id).maybeSingle();
    if (error) throw error;
    if (!data) return fail({ code: 'RESOURCE_MISSING', message: '测验不存在或无权访问。', retryable: false }, undefined, 404);
    if (data.status !== 'in_progress') return fail({ code: 'STATE_INVALID', message: '已提交的答卷不能修改。', retryable: false }, undefined, 409);
    if (!validateQuizAnswers(data.questions, body.answers)) return fail({ code: 'VALIDATION_ERROR', message: '作答题号或选项无效。', retryable: false });
    const { data: saved, error: saveError } = await admin.from('quiz_sessions').update({ answers: body.answers })
      .eq('id', body.session_id).eq('user_id', identity.user.id).eq('status', 'in_progress').select('id').maybeSingle();
    if (saveError) throw saveError;
    if (!saved) return fail({ code: 'STATE_INVALID', message: '测验状态已变化，请刷新。', retryable: false }, undefined, 409);
    return ok({ saved: true });
  } catch (error) { return fail(errorFromUnknown(error)); }
}
