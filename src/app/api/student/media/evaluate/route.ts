import { NextRequest } from 'next/server';
import { evaluateVision } from '@/lib/coze-workflows';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const body = (await request.json()) as { sessionId?: string; path?: string; mimeType?: string; size?: number; sha256?: string };
    if (!body.sessionId || !body.path || !body.mimeType || !body.size || !body.sha256) {
      return fail({ code: 'VALIDATION_ERROR', message: '图片登记信息不完整。', retryable: false });
    }
    if (!body.path.startsWith(`${identity.user.id}/`)) throw new Error('FORBIDDEN');
    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error: sessionError } = await supabase.from('agent_sessions').select('id,user_id,current_step').eq('id', body.sessionId).single();
    if (sessionError) throw sessionError;
    if (session.user_id !== identity.user.id) throw new Error('FORBIDDEN');
    const { data: signed, error: signedError } = await supabase.storage.from('student-media').createSignedUrl(body.path, 300);
    if (signedError) throw signedError;
    const workflow = await evaluateVision({
      mode: 'student_upload',
      image_url: signed.signedUrl,
      step_id: session.current_step,
      checks: ['quality', 'relevance', 'visible_evidence', 'limitations', 'teacher_review'],
    });
    const { data, error } = await supabase.from('media_submissions').insert({
      session_id: session.id,
      step_no: session.current_step,
      storage_path: body.path,
      mime_type: body.mimeType,
      size_bytes: body.size,
      sha256: body.sha256,
      evaluation: workflow.data,
    }).select('id,step_no,evaluation,created_at').single();
    if (error) throw error;
    await supabase.from('agent_messages').insert({
      session_id: session.id,
      role: 'assistant',
      kind: 'feedback',
      step_no: session.current_step,
      content: String(workflow.data.studentFeedback || workflow.data.summary || '图片已完成分析。'),
      metadata: { mediaId: data.id, workflowRunId: workflow.runId },
    });
    return ok(data);
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
