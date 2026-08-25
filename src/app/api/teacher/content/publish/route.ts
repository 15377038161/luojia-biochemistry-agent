import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { validateCourseContent } from '@/domain/course-content';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (!identity.user.capabilities.teacherWorkspace) return fail({ code: 'FORBIDDEN', message: '仅教师可发布课程内容。', retryable: false }, undefined, 403);
  try {
    const body = await request.json() as { draftId?: string };
    if (!body.draftId) return fail({ code: 'VALIDATION_ERROR', message: '缺少草稿编号。', retryable: false }, undefined, 400);
    const { supabase } = createSupabaseRouteClient(request);
    const { data: draft, error: draftError } = await supabase.from('content_drafts')
      .select('id,experiment_id,version,payload,status').eq('id', body.draftId).single();
    if (draftError) throw draftError;
    const validation = validateCourseContent(draft.payload);
    if (!validation.valid) return fail({ code: 'VALIDATION_ERROR', message: validation.errors.join('；'), retryable: false }, undefined, 400);
    const sourceHash = createHash('sha256').update(JSON.stringify(draft.payload)).digest('hex');
    const { data: version, error: versionError } = await supabase.from('content_versions').insert({
      experiment_id: draft.experiment_id,
      version: draft.version,
      manifest: draft.payload,
      source_hash: sourceHash,
      published_at: new Date().toISOString(),
    }).select('id,version,published_at').single();
    if (versionError) throw versionError;
    const { error: updateError } = await supabase.from('content_drafts').update({
      status: 'published', published_content_version_id: version.id,
      updated_by: identity.user.id, updated_at: new Date().toISOString(),
    }).eq('id', draft.id);
    if (updateError) throw updateError;
    return ok({ version, validation });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
