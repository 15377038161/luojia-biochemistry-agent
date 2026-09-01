import { NextResponse, type NextRequest } from 'next/server';
import { fail, ok, errorFromUnknown } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { publishContentDraft } from '@/lib/services/content';

interface PublishBody {
  draftId?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getSessionUser(request.cookies);
    if (!identity) return fail({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED' }, undefined, 401);
    if (!identity.user.capabilities.teacherWorkspace) {
      return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN' }, undefined, 403);
    }
    const body = (await request.json()) as PublishBody;
    if (typeof body.draftId !== 'string' || !body.draftId.trim()) {
      return fail({ code: 'VALIDATION_ERROR', message: '缺少要发布的草稿版本。' }, undefined, 400);
    }
    const admin = getSupabaseAdminClient();
    const published = await publishContentDraft(admin, body.draftId);
    return ok({
      published: {
        id: published.id,
        version: published.version,
        published_at: published.published_at,
      },
    });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
