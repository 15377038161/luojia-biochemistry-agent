import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { getSessionUser } from '@/lib/supabase-auth';
import { ok, fail, errorFromUnknown } from '@/lib/api-result';
import type { QuizResult } from '@/lib/quiz-contract';

export async function GET(req: NextRequest) {
  try {
    const identity = await getSessionUser(req.cookies);
    if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
    const stepNo = Number(req.nextUrl.searchParams.get('stepNo'));
    const page = Number(req.nextUrl.searchParams.get('page') || 0);
    if (!Number.isInteger(stepNo) || stepNo < 1 || stepNo > 8 || !Number.isInteger(page) || page < 0 || page > 10000) return fail({ code: 'VALIDATION_ERROR', message: '步骤或页码无效。', retryable: false });
    const admin = getSupabaseAdminClient();
    const [history, active] = await Promise.all([
      admin.from('quiz_sessions').select('id,results,created_at', { count: 'exact' })
        .eq('user_id', identity.user.id).eq('step_no', stepNo).eq('status', 'graded')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 10, page * 10 + 9),
      admin.from('quiz_sessions').select('id').eq('user_id', identity.user.id).eq('step_no', stepNo)
        .in('status', ['in_progress', 'submitted']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (history.error) throw history.error;
    if (active.error) throw active.error;
    return ok({
      items: (history.data || []).map(row => {
        const results = (row.results || []) as QuizResult[];
        return { session_id: row.id, created_at: row.created_at, total: results.length, correct: results.filter(r => r.is_correct).length };
      }),
      nextPage: (history.count || 0) > (page + 1) * 10 ? page + 1 : null,
      hasCompleted: (history.count || 0) > 0,
      activeId: active.data?.id || null,
    });
  } catch (error) { return fail(errorFromUnknown(error)); }
}
