import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { defaultCourseContent, validateCourseContent } from '@/domain/course-content';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

export async function GET(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  const sessionId = request.nextUrl.searchParams.get('sessionId')?.trim();
  if (!sessionId) return fail({ code: 'VALIDATION_ERROR', message: '缺少会话编号。', retryable: false }, undefined, 400);
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error } = await supabase.from('agent_sessions')
      .select('user_id,content_version_id').eq('id', sessionId).single();
    if (error) throw error;
    if (session.user_id !== identity.user.id) return fail({ code: 'FORBIDDEN', message: '无权读取该会话内容。', retryable: false }, undefined, 403);
    if (!session.content_version_id) return ok(defaultCourseContent());
    const { data: version, error: versionError } = await supabase.from('content_versions')
      .select('manifest').eq('id', session.content_version_id).single();
    if (versionError) throw versionError;
    const validation = validateCourseContent(version.manifest);
    return ok(validation.valid ? version.manifest : defaultCourseContent());
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
