import { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok, requestId } from '@/lib/api-result';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { getSessionUser } from '@/lib/supabase-auth';
import { listAppeals, resolveAppeal } from '@/lib/services/appeals';

export async function GET(request: NextRequest) {
  const id = requestId();
  try {
    const identity = await getSessionUser(request.cookies);
    if (!identity) return fail({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED', retryable: false }, id, 401);
    if (!identity.user.capabilities.teacherWorkspace) {
      return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN', retryable: false }, id, 403);
    }

    const admin = getSupabaseAdminClient();
    const items = await listAppeals(admin);
    return ok(items, id);
  } catch (error) {
    return fail(errorFromUnknown(error), id, 500);
  }
}

export async function POST(request: NextRequest) {
  const id = requestId();
  try {
    const identity = await getSessionUser(request.cookies);
    if (!identity) return fail({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED', retryable: false }, id, 401);
    if (!identity.user.capabilities.teacherWorkspace) {
      return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN', retryable: false }, id, 403);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestIdValue = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    const resolution = typeof body.resolution === 'string' ? body.resolution.trim() : '';
    const overrideScore = typeof body.overrideScore === 'number' && Number.isFinite(body.overrideScore)
      ? Math.min(100, Math.max(0, body.overrideScore))
      : null;
    const accepted = body.accepted === true;
    if (!requestIdValue || !resolution || resolution.length < 10) {
      return fail({ code: 'VALIDATION_ERROR', message: '请填写至少10字的处理意见。', retryable: false }, id, 400);
    }
    if (accepted && overrideScore !== null) {
      return fail({ code: 'VALIDATION_ERROR', message: '确认成绩与调整成绩不能同时进行。', retryable: false }, id, 400);
    }

    const admin = getSupabaseAdminClient();
    const resolved = await resolveAppeal(admin, {
      requestId: requestIdValue,
      resolution,
      overrideScore,
      accepted,
      teacherId: identity.user.id,
    });
    return ok(
      {
        id: resolved.id,
        status: resolved.status,
        reason: resolved.reason,
        resolution: resolved.resolution,
      },
      id,
    );
  } catch (error) {
    return fail(errorFromUnknown(error), id, 500);
  }
}
