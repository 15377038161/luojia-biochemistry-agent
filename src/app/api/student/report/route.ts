import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
import { createSupabaseRouteClient } from '@/lib/supabase-ssr';
import { getSupabaseAdminClient } from '@/lib/supabase-client';
import { getSessionUser } from '@/lib/supabase-auth';
import { experimentSteps } from '@/domain/experiment';
import { normalizeStudyReport } from '@/domain/study-report';
import { generateReport } from '@/lib/coze-workflows';
import {
  buildChaoxingReportTaskflowPayload,
  type ChaoxingTaskflowPayload,
} from '@/lib/chaoxing-taskflow-contract';
import { buildLearningReportContent, computeGradeSummary, loadGradingFacts } from '@/lib/services/grading';

function normalizeStep(value: unknown): number {
  const step = Number(value);
  return Number.isFinite(step) && step > 0 ? Math.trunc(step) : 1;
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getSessionUser(request.cookies);
    if (!identity) {
      return fail({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED', retryable: false });
    }

    const body = await request.json().catch(() => null) as { sessionId?: unknown } | null;
    if (!body || typeof body.sessionId !== 'string') {
      return fail({ code: 'VALIDATION_ERROR', message: '缺少 sessionId 参数。', retryable: false });
    }

    const { supabase } = createSupabaseRouteClient(request);
    const { data: session, error: sessionError } = await supabase
      .from('agent_sessions')
      .select('id,user_id,agent_role,current_step,completed_at')
      .eq('id', body.sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return fail({ code: 'RESOURCE_MISSING', message: '学生实验会话不存在。', retryable: false });
    if (session.user_id !== identity.user.id) return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN', retryable: false });

    const steps = experimentSteps;
    const stepIds = steps.map((step) => normalizeStep(step.id));
    const { data: stepStates, error: stateError } = await supabase
      .from('step_states')
      .select('step_no,status')
      .eq('session_id', session.id);
    if (stateError) throw stateError;
    const readySteps = (stepStates ?? [])
      .filter((state) => Number(state.step_no) > 0 && state.status === 'passed')
      .map((state) => Number(state.step_no));
    const missingSteps = stepIds.filter((id) => !readySteps.includes(id));
    if (missingSteps.length > 0) {
      return fail({
        code: 'STATE_INVALID',
        message: `还有步骤未完成：第 ${missingSteps.join('、')} 步。`,
        retryable: false,
      });
    }

    const { data: evaluations, error: evaluationError } = await supabase
      .from('evaluations')
      .select('step_no,decision,confidence,result,step_attempts!inner(answer)')
      .eq('step_attempts.session_id', session.id)
      .order('created_at', { ascending: true });
    if (evaluationError) throw evaluationError;

    const attempts = steps.map((step) => {
      const stepNo = normalizeStep(step.id);
      const attempt = (evaluations ?? []).filter((evaluation) => Number(evaluation.step_no) === stepNo).at(-1);
      const attemptRow = attempt?.step_attempts as { answer?: string | null } | { answer?: string | null }[] | null | undefined;
      const answer = Array.isArray(attemptRow) ? attemptRow.at(0)?.answer : attemptRow?.answer;
      return {
        step_no: stepNo,
        step_id: step.id,
        title: step.title,
        short_title: step.shortTitle,
        answer: String(answer ?? ''),
        decision: attempt?.decision ?? 'revise',
        confidence: Number(attempt?.confidence) || 0,
      };
    });

    const report = await generateReport({
      student_name: identity.user.profile.displayName ?? '学生',
      steps: steps.map((step) => ({
        step_no: normalizeStep(step.id),
        title: step.title,
        short_title: step.shortTitle,
        key_points: step.keyPoints.map((point) => ({
          rubric_id: point.id,
          label: point.label,
          hints: point.hints,
        })),
      })),
      attempts,
      constraints: '用中文生成总学习报告；必须覆盖八步证据、知识理解、操作描述、科学决策、问题解决、结果分析与判断、改进建议与教师确认事项。',
    });
    const sections = normalizeStudyReport(report.data) as unknown as Record<string, unknown>;
    const markdown = [
      `# 学习报告（${identity.user.profile.displayName ?? '学生'}）`,
      '',
      ...attempts.map((attempt) => `## ${attempt.step_no}. ${attempt.title}`),
      '',
      String((sections as { summary?: string }).summary ?? ''),
    ].join('\n');

    // 统一成绩计算入口：总报告 content.grading 与成绩页、教师复核共用同一模块。
    const admin = getSupabaseAdminClient();
    const facts = await loadGradingFacts(admin, session.id);
    const summary = computeGradeSummary(facts);
    const content = buildLearningReportContent(summary, sections, facts.finalization);

    const { data, error } = await supabase.rpc('record_learning_report', {
      target_session: session.id,
      report_content: content,
      report_markdown: markdown,
      workflow_run_value: report.runId || null,
    });
    if (error) throw error;

    // 教师体验报告不进入学习通同步；学生报告保留既有 taskflow 契约。
    let chaoxingTaskflow: ChaoxingTaskflowPayload | null = null;
    if (session.agent_role === 'student') {
      const { data: reportRow, error: reportError } = await supabase
        .from('learning_reports')
        .select('id,version')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (reportError) throw reportError;
      if (reportRow) {
        chaoxingTaskflow = buildChaoxingReportTaskflowPayload({
          reportId: reportRow.id,
          studentId: session.user_id,
          versionNo: Number(reportRow.version) || 1,
          markdown,
        });
      }
    }

    return ok({ ...data, grading: summary, chaoxingTaskflow }, randomUUID());
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
