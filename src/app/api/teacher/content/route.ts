import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { defaultCourseContent, validateCourseContent } from '@/domain/course-content';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';

const EXPERIMENT_ID = '10000000-0000-4000-8000-000000000003';

export async function GET(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (!identity.user.capabilities.teacherWorkspace) return fail({ code: 'FORBIDDEN', message: '仅教师可管理课程内容。', retryable: false }, undefined, 403);
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data, error } = await supabase.from('content_drafts')
      .select('id,version,payload,source_refs,status,published_content_version_id,updated_at')
      .eq('experiment_id', EXPERIMENT_ID).order('version', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const payload = data?.payload ?? defaultCourseContent();
    return ok({ draft: data ? { ...data, payload } : null, payload, validation: validateCourseContent(payload) });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}

export async function PUT(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  if (!identity.user.capabilities.teacherWorkspace) return fail({ code: 'FORBIDDEN', message: '仅教师可管理课程内容。', retryable: false }, undefined, 403);
  try {
    const body = await request.json() as { draftId?: string; payload?: unknown; sourceRefs?: string[] };
    const validation = validateCourseContent(body.payload);
    const { supabase } = createSupabaseRouteClient(request);
    if (body.draftId) {
      const { data: current, error: currentError } = await supabase.from('content_drafts')
        .select('id,status').eq('id', body.draftId).single();
      if (currentError) throw currentError;
      if (current.status !== 'draft') {
        return fail({ code: 'STATE_INVALID', message: '已发布版本不可覆盖，请创建新草稿。', retryable: false }, undefined, 409);
      }
      const { data, error } = await supabase.from('content_drafts').update({
        payload: body.payload,
        source_refs: body.sourceRefs ?? [],
        status: 'draft',
        updated_by: identity.user.id,
        updated_at: new Date().toISOString(),
      }).eq('id', body.draftId).select('id,version,payload,status,updated_at').single();
      if (error) throw error;
      return ok({ draft: data, validation });
    }
    const { data: latest, error: latestError } = await supabase.from('content_drafts')
      .select('version').eq('experiment_id', EXPERIMENT_ID).order('version', { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw latestError;
    const { data, error } = await supabase.from('content_drafts').insert({
      experiment_id: EXPERIMENT_ID,
      version: (latest?.version ?? 0) + 1,
      payload: body.payload,
      source_refs: body.sourceRefs ?? [],
      created_by: identity.user.id,
      updated_by: identity.user.id,
    }).select('id,version,payload,status,updated_at').single();
    if (error) throw error;
    return ok({ draft: data, validation });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
