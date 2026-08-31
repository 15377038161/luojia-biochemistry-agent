import { NextRequest } from 'next/server';
import { generateReport } from '@/lib/coze-workflows';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { getSessionUser } from '@/lib/supabase-auth';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';
import { normalizeStudyReport } from '@/domain/study-report';
import { buildChaoxingReportTaskflowPayload } from '@/lib/chaoxing-taskflow-contract';

export async function POST(request: NextRequest) {
  const identity = await getSessionUser(request.cookies);
  if (!identity) return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
  try {
    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) return fail({ code: 'VALIDATION_ERROR', message: '缺少会话编号。', retryable: false });
    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error: sessionError } = await supabase.from('agent_sessions')
      .select('id,user_id,completed_at,session_mode').eq('id', body.sessionId).single();
    if (sessionError) throw sessionError;
    if (session.user_id !== identity.user.id) throw new Error('FORBIDDEN');
    const [{ data: cached }, { data: steps, error: stepError }, { data: attempts, error: attemptError }] = await Promise.all([
      supabase.from('learning_reports').select('id,rendered_markdown,content,version,created_at').eq('session_id', session.id).order('version', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('step_states').select('step_no,status,attempt_count,final_summary').eq('session_id', session.id).order('step_no'),
      supabase.from('step_attempts').select('step_no,version_no,answer,submitted_at,evaluations(result)').eq('session_id', session.id).order('submitted_at'),
    ]);
    if (stepError) throw stepError;
    if (attemptError) throw attemptError;
    if (cached && session.completed_at) return ok(cached);
    const workflow = await generateReport({
      student_name: identity.user.profile.displayName,
      steps,
      attempts,
      constraints: { learning_report_only: true, no_invented_results: true },
    });
    const report = normalizeStudyReport(workflow.data);
    const { data, error } = await supabase.rpc('record_learning_report', {
      target_session: session.id,
      report_content: report.sections,
      report_markdown: report.markdown,
      workflow_run_value: workflow.runId || null,
    });
    if (error) throw error;
    const chaoxingTaskflow = session.session_mode === 'student'
      ? buildChaoxingReportTaskflowPayload({
        reportId: data.id,
        studentId: identity.user.id,
        versionNo: data.version,
        markdown: data.rendered_markdown,
      })
      : undefined;
    return ok({ ...data, chaoxingTaskflow });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
