import { NextRequest } from 'next/server';
import { answerTeacherQuery } from '@/lib/teacher-agent';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (!identity.user.capabilities.teacherWorkspace) return fail({ code: 'FORBIDDEN', message: '只有教师可以查询班级数据。', retryable: false }, undefined, 403);
  try {
    const body = (await request.json()) as { sessionId?: string; query?: string };
    const query = body.query?.trim() || '';
    if (!body.sessionId || query.length < 2 || query.length > 1000) return fail({ code: 'VALIDATION_ERROR', message: '请输入2—1000字的查询。', retryable: false });
    const { supabase } = createSupabaseRouteClient(request);
    const answer = await answerTeacherQuery(supabase, query);
    const rows = [
      { session_id: body.sessionId, role: 'user', kind: 'question', step_no: null, content: query, metadata: {} },
      { session_id: body.sessionId, role: 'assistant', kind: 'feedback', step_no: null, content: answer.answer, metadata: { scope: answer.scope, evidence: answer.evidence, suggestedActions: answer.suggestedActions } },
    ];
    const { error } = await supabase.from('agent_messages').insert(rows);
    if (error) throw error;
    return ok(answer);
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
