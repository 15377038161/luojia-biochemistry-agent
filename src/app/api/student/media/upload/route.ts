import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const body = (await request.json()) as { sessionId?: string; mimeType?: string; extension?: string };
    if (!body.sessionId || !body.mimeType || !allowed.has(body.mimeType)) {
      return fail({ code: 'VALIDATION_ERROR', message: '仅支持JPG、PNG或WebP图片。', retryable: false });
    }
    const extension = ['jpg', 'jpeg', 'png', 'webp'].includes(body.extension || '') ? body.extension : 'jpg';
    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error: sessionError } = await supabase.from('agent_sessions').select('id,user_id,current_step').eq('id', body.sessionId).single();
    if (sessionError) throw sessionError;
    if (session.user_id !== identity.user.id) throw new Error('FORBIDDEN');
    const path = `${identity.user.id}/${session.id}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await supabase.storage.from('student-media').createSignedUploadUrl(path);
    if (error) throw error;
    return ok({ path, token: data.token, signedUrl: data.signedUrl, stepId: session.current_step });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
