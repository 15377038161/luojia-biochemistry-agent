import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { errorFromUnknown, fail, ok } from '@/lib/api-result';
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
    const identity = await getSessionUser(request);
    if (!identity) {
      return fail({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED', retryable: false });
    }

    const body = await request.json().catch(() => null) as { sessionId?: unknown } | null;
    if (!body || typeof body.sessionId !== 'string') {
      return fail({ code: 'VALIDATION_ERROR', message: '缺少 sessionId 参数。', retryable: false });
    }

    const { supabase } = identity;
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
        message: `还有步骤未完成：第 ${missingSteps.join('、')} 步。请先完成这些步骤，再返回实验地图继续学习。`,
        retryable: false,
      });
    }

    const { data: evaluations, error: evaluationError } = await supabase
      .from('evaluations')
      .select('step_no,decision,confidence,total_score,result,step_attempts!inner(answer)')
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
        score: Number(attempt?.total_score) || 0,
        evaluation: attempt?.result ?? null,
        resource_refs: [{ label: `${step.shortTitle}课程资料`, source: step.source }],
      };
    });

    const admin = supabase;
    const { data: experimentProfile, error: profileError } = await admin.from('student_experiment_profiles')
      .select('target_gene,sequence_source,accession,cloning_strategy,design_snapshot').eq('session_id', session.id).maybeSingle();
    if (profileError) throw profileError;

    // 请求标识：仅用于关联本请求内的非敏感耗时日志，不记录学生原文/会话/凭证。
    const reqId = randomUUID();

    // 本 POST 仅做「生成」。已有报告的读取由 GET 方法单独提供（只读、不调用模型），
    // 避免「超时后重新查询」误触发重复付费生成。后端不做时间戳近似缓存复用：
    // 无法无 DDL 安全取得「评分事实 + 内容快照 + 教师复核」的完整 fingerprint，
    // 时间戳近似会掩盖教师复核（record_teacher_review）与新评价，故显式关闭复用。
    const generateStart = Date.now();
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
      experiment_profile: experimentProfile ?? { target_gene: 'EGFP', sequence_source: 'recommended', cloning_strategy: 'recombination' },
      constraints: '用中文生成总学习报告；逐步引用学生原文和评阅证据，覆盖优势、失分点、参数遗漏、推理链、知识短板、误差分析、改写答案、五维能力、可执行建议与教师确认事项。推荐资料只能使用每步resource_refs，不得生成外部链接。',
    });
    console.log(`[report] requestId=${reqId} phase=generate durationMs=${Date.now() - generateStart}`);
    const normalizedReport = normalizeStudyReport(report.data);
    const markdown = normalizedReport.markdown;

    // 统一成绩计算入口：总报告 content.grading 与成绩页、教师复核共用同一模块。
    const facts = await loadGradingFacts(admin, session.id);
    const summary = computeGradeSummary(facts);
    const content = buildLearningReportContent(summary, normalizedReport as unknown as Record<string, unknown>, facts.finalization);

    const saveStart = Date.now();
    const { data, error } = await supabase.rpc('record_learning_report', {
      target_session: session.id,
      report_content: content,
      report_markdown: markdown,
      workflow_run_value: report.runId || null,
    });
    console.log(`[report] requestId=${reqId} phase=record durationMs=${Date.now() - saveStart}`);
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

// 只读查询最近一份学习报告：不调用模型、不写入，供「超时后查看是否已生成」使用。
// 与 POST（生成）分离，避免超时重试误触发重复付费生成。
export async function GET(request: NextRequest) {
  try {
    const identity = await getSessionUser(request);
    if (!identity) {
      return fail({ code: 'AUTH_REQUIRED', message: '请先登录。', retryable: false }, undefined, 401);
    }
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return fail({ code: 'VALIDATION_ERROR', message: '缺少 sessionId 参数。', retryable: false });
    }
    const { supabase } = identity;
    const { data: session, error: sessionError } = await supabase
      .from('agent_sessions')
      .select('id,user_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return fail({ code: 'RESOURCE_MISSING', message: '学生实验会话不存在。', retryable: false }, undefined, 404);
    if (session.user_id !== identity.user.id) return fail({ code: 'FORBIDDEN', message: '无权查看该会话。', retryable: false }, undefined, 403);

    const { data: report, error: reportError } = await supabase
      .from('learning_reports')
      .select('id,version,content,rendered_markdown,workflow_run_id,created_at')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reportError) throw reportError;

    return ok({
      exists: Boolean(report),
      id: report?.id ?? null,
      version: report ? Number(report.version) || 1 : null,
      content: report?.content ?? null,
      rendered_markdown: report?.rendered_markdown ?? null,
      workflow_run_id: report?.workflow_run_id ?? null,
      created_at: report?.created_at ?? null,
    });
  } catch (error) {
    return fail(errorFromUnknown(error), undefined, 500);
  }
}
