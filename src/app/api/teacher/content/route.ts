import { NextResponse, type NextRequest } from 'next/server';
import { fail, ok, errorFromUnknown } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { validateCourseContent, defaultCourseContent, type CourseContentPayload } from '@/domain/course-content';
import {
  findCurrentDraft,
  payloadFromManifest,
  saveContentDraft,
  toDraftRecord,
} from '@/lib/services/content';

interface SaveDraftBody {
  draftId?: unknown;
  payload?: unknown;
  sourceRefs?: unknown;
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getSessionUser(request.cookies);
    if (!identity) return fail({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED' }, undefined, 401);
    if (!identity.user.capabilities.teacherWorkspace) {
      return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN' }, undefined, 403);
    }
    const admin = getSupabaseAdminClient();
    const { data: draftRow, error } = await findCurrentDraft(admin);
    if (error) throw error;
    const payload = draftRow ? payloadFromManifest(draftRow.manifest) : null;
    const effectivePayload = payload ?? defaultCourseContent();
    return ok({
      draft: toDraftRecord(draftRow),
      payload: effectivePayload,
      validation: validateCourseContent(effectivePayload),
    });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const identity = await getSessionUser(request.cookies);
    if (!identity) return fail({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED' }, undefined, 401);
    if (!identity.user.capabilities.teacherWorkspace) {
      return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN' }, undefined, 403);
    }
    const body = (await request.json()) as SaveDraftBody;
    const validation = validateCourseContent(body.payload);
    if (!validation.valid) {
      return fail({ code: 'VALIDATION_ERROR', message: `内容校验未通过：${validation.errors.join('；')}` }, undefined, 400);
    }
    const sourceRefs = Array.isArray(body.sourceRefs)
      ? body.sourceRefs.filter((item): item is string => typeof item === 'string')
      : [];
    const draftId = typeof body.draftId === 'string' && body.draftId.trim() ? body.draftId : undefined;
    const admin = getSupabaseAdminClient();
    const row = await saveContentDraft(admin, body.payload as CourseContentPayload, sourceRefs, identity.user.id, draftId);
    return ok({
      draft: toDraftRecord(row),
      validation: validateCourseContent(body.payload),
    });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
