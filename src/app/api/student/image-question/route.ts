import { NextRequest } from 'next/server';
import { imageQuestionForStep } from '@/domain/media';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) return fail({ code: 'VALIDATION_ERROR', message: '缺少会话编号。', retryable: false });
    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error: sessionError } = await supabase.from('agent_sessions').select('id,user_id,current_step').eq('id', body.sessionId).single();
    if (sessionError) throw sessionError;
    if (session.user_id !== identity.user.id) throw new Error('FORBIDDEN');
    const question = imageQuestionForStep(session.current_step);
    const { data, error } = await supabase.from('agent_messages').insert({
      session_id: session.id,
      role: 'assistant',
      kind: 'image_answer',
      step_no: session.current_step,
      content: question.prompt,
      metadata: { mediaUrl: question.imagePath, imageQuestionId: question.id, source: question.source },
    }).select('id,role,kind,step_no,content,metadata,created_at').single();
    if (error) throw error;
    return ok({ id: data.id, role: data.role, kind: data.kind, stepId: data.step_no, content: data.content, mediaUrl: data.metadata.mediaUrl, createdAt: data.created_at });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
