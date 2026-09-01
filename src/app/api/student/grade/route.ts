import type { NextRequest } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { getSessionUser } from '@/lib/supabase-auth';
import { errorFromUnknown, fail, ok, requestId } from '@/lib/api-result';
import { computeGradeSummary, loadGradingFacts } from '@/lib/services/grading';
import { appealStateForSession, submitAppeal } from '@/lib/services/appeals';

interface GradeBody {
  gradeId?: string;
  reason?: string;
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getSessionUser(request.cookies);
    if (!identity) {
      return fail({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED', retryable: false });
    }

    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return fail({ code: 'VALIDATION_ERROR', message: '缺少 sessionId。', retryable: false });
    }

    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error } = await supabase
      .from('agent_sessions')
      .select('id,user_id,agent_role')
      .eq('id', sessionId)
      .eq('agent_role', 'student')
      .maybeSingle();
    if (error) throw error;
    if (!session || session.user_id !== identity.user.id) {
      return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN', retryable: false });
    }

    const admin = getSupabaseAdminClient();
    const facts = await loadGradingFacts(admin, sessionId);
    const summary = computeGradeSummary(facts);
    const appeal = await appealStateForSession(admin, sessionId);

    return ok({
      id: sessionId,
      process_score: summary.process_score,
      contribution_points: summary.contribution_points,
      status: summary.status,
      dimensions: summary.dimensions,
      completion: summary.completion,
      review_required_steps: summary.review_required_steps,
      review: appeal,
    });
  } catch (error) {
    return fail(errorFromUnknown(error), requestId(), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getSessionUser(request.cookies);
    if (!identity) {
      return fail({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED', retryable: false });
    }

    const body = (await request.json()) as GradeBody;
    const sessionId = String(body.gradeId ?? '').trim();
    const reason = String(body.reason ?? '').trim();
    if (!sessionId || !reason) {
      return fail({ code: 'VALIDATION_ERROR', message: '缺少申诉对象或申诉理由。', retryable: false });
    }

    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error } = await supabase
      .from('agent_sessions')
      .select('id,user_id,agent_role')
      .eq('id', sessionId)
      .eq('agent_role', 'student')
      .maybeSingle();
    if (error) throw error;
    if (!session || session.user_id !== identity.user.id) {
      return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN', retryable: false });
    }

    const admin = getSupabaseAdminClient();
    const { data: report, error: reportError } = await admin
      .from('learning_reports')
      .select('id')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reportError) throw reportError;
    if (!report) {
      return fail({ code: 'STATE_INVALID', message: '还没有学习报告，暂不能提交申诉。', retryable: false }, requestId(), 409);
    }

    const appeal = await submitAppeal(admin, {
      sessionId,
      userId: identity.user.id,
      reportId: report.id,
      reason,
    });

    return ok({
      id: appeal.requestId,
      status: 'pending',
      reason,
      resolution: null,
      createdAt: appeal.createdAt,
    });
  } catch (error) {
    const id = requestId();
    if (error instanceof Error && error.message === 'STATE_INVALID') {
      return fail({ code: 'STATE_INVALID', message: '同一申诉未处理完成前不能重复提交。', retryable: false }, id, 409);
    }
    return fail(errorFromUnknown(error), id, 500);
  }
}
