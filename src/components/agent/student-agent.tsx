'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import PageBackground from '@/components/page-background';
import StudyReport from '@/components/student/study-report';
import ExperimentMap from '@/components/student/experiment-map';
import StepWorkstation from '@/components/student/step-workstation';
import GlobalAiTutor from '@/components/student/global-ai-tutor';
import type { ApiResult, StepProgress, StudentSessionView } from '@/domain/agent';
import type { CourseContentPayload } from '@/domain/course-content';
import { defaultCourseContent } from '@/domain/course-content';
import { dispatchChaoxingTaskflow } from '@/lib/chaoxing-taskflow-client';
import type { ChaoxingTaskflowPayload } from '@/lib/chaoxing-taskflow-contract';
import { clientErrorMessage } from '@/lib/client-request';
import { authFetch } from '@/lib/authed-fetch';
import { logout as platformLogout, withTimeout } from '@/lib/auth';
import { getExperimentStep } from '@/domain/experiment';

interface Props {
  displayName: string;
  demo?: boolean;
  preview?: boolean;
  practiceMode?: boolean;
  canSwitchToTeacher?: boolean;
  routeBase?: string;
  initialStep?: number;
  reportPage?: boolean;
}

type Api<T> = ApiResult<T>;

async function apiPost<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const payload = await response.json() as Api<T>;
  if (!payload.ok) throw new Error(payload.error.message);
  return payload.data;
}

// 完整学习报告由大模型生成，可能耗时 30–90s；给前端一个有界等待上限，
// 超时后停止前端等待并提示「可能仍在后台生成，可重新查询」，不盲目重复生成。
const REPORT_TIMEOUT_MS = 120_000;

function buildPreviewSession(displayName: string): StudentSessionView {
  const steps: StepProgress[] = Array.from({ length: 8 }, (_, index) => ({
    stepId: index + 1,
    status: index < 3 ? 'passed' : index === 3 ? 'active' : 'locked',
    attemptCount: 0,
  }));
  return { sessionId: 'preview', studentName: displayName, currentStep: 4, completed: false, steps, messages: [] };
}

const PREVIEW_REPORT_MARKDOWN = `# 学习报告（功能预览）

正式环境中，本报告会基于你的全部步骤描述、评阅记录与五维得分，由大模型生成个性化总结。

## 预览说明
- 知识理解：概念掌握扎实
- 操作描述：SOP 步骤完整
- 科学决策：Gate 判定理由充分`;

export default function StudentAgent({ displayName, demo = false, preview = false, practiceMode = false, canSwitchToTeacher = false, routeBase, initialStep, reportPage = false }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<StudentSessionView | null>(preview ? buildPreviewSession(displayName) : null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState<number | null>(initialStep ?? null);
  const [reportOpen, setReportOpen] = useState(reportPage);
  const [reportMarkdown, setReportMarkdown] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSyncNotice, setReportSyncNotice] = useState('');
  const [reportElapsedStart, setReportElapsedStart] = useState<number | null>(null);
  // 迟到结果忽略：每次加载递增 runId，旧 runId 的 settle 一律丢弃；abort 仅停止前端等待，不声称已取消后台模型。
  const reportRunRef = useRef(0);
  const reportAbortRef = useRef<AbortController | null>(null);
  // 已尝试标记：避免 reportOpen/loadReport 引用变化导致 useEffect 反复触发重复生成。
  const reportAttemptedRef = useRef(false);
  const [courseContent, setCourseContent] = useState<CourseContentPayload>(defaultCourseContent());
  const routeHref = useCallback((path: string) => {
    const params = new URLSearchParams();
    if (preview) params.set('preview', '1');
    // 教师体验模式需在后续导航（步骤/报告/返回地图）中保留 practice=1，否则会中途切回正式学生会话
    if (practiceMode) params.set('practice', '1');
    const qs = params.toString();
    return `${routeBase}/${path}${qs ? `?${qs}` : ''}`;
  }, [preview, practiceMode, routeBase]);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const sessionEndpoint = practiceMode ? '/api/teacher/practice-session' : '/api/student/session';
      const response = await authFetch(sessionEndpoint);
      const payload = await response.json() as Api<StudentSessionView | null>;
      if (!payload.ok) throw new Error(payload.error.message);
      if (payload.data) {
        setSession(payload.data);
      } else {
        const created = await apiPost<StudentSessionView>(sessionEndpoint, {});
        setSession(created);
      }
      setLoading(false);
    } catch (reason) {
      setError(clientErrorMessage(reason, '实验会话加载失败'));
      setLoading(false);
    }
  }, [practiceMode]);

  useEffect(() => {
    if (!preview && !session && loading) void loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (preview || !session) return;
    let cancelled = false;
    void authFetch(`/api/student/content?sessionId=${encodeURIComponent(session.sessionId)}`)
      .then((response) => response.json() as Promise<Api<CourseContentPayload>>)
      .then((payload) => { if (!cancelled && payload.ok) setCourseContent(payload.data); })
      .catch(() => { /* 内容服务异常时继续使用内置已校验版本。 */ });
    return () => { cancelled = true; };
  }, [preview, session]);

  const loadReport = useCallback(async (force = false) => {
    // 防重复：busy 期间不并发触发；非强制且已尝试过则不再自动重复（重试走 force=true）。
    if (!session || reportBusy) return;
    if (!force && reportAttemptedRef.current) return;
    reportAttemptedRef.current = true;
    const runId = ++reportRunRef.current;
    setReportBusy(true);
    setReportError('');
    if (preview) {
      setReportMarkdown(PREVIEW_REPORT_MARKDOWN);
      setReportBusy(false);
      return;
    }
    const controller = new AbortController();
    reportAbortRef.current = controller;
    const startMs = Date.now();
    setReportElapsedStart(startMs);
    try {
      const payload = await withTimeout(
        apiPost<{ rendered_markdown?: string; content?: string; chaoxingTaskflow?: ChaoxingTaskflowPayload }>(
          '/api/student/report',
          { sessionId: session.sessionId },
          controller.signal,
        ),
        REPORT_TIMEOUT_MS,
      );
      if (runId !== reportRunRef.current) return; // 迟到结果忽略
      setReportMarkdown(payload.rendered_markdown || payload.content || '报告内容为空。');
      if (payload.chaoxingTaskflow) {
        try {
          const dispatch = await dispatchChaoxingTaskflow(payload.chaoxingTaskflow);
          if (runId === reportRunRef.current) setReportSyncNotice(dispatch.detail);
        } catch {
          if (runId === reportRunRef.current) setReportSyncNotice('学习报告已保存；超星网页桥接暂不可用，服务器同步队列会保留记录。');
        }
      }
    } catch (reason) {
      // 主动取消或超时后又有新 runId：静默忽略，不覆盖后续状态。
      if (runId !== reportRunRef.current || controller.signal.aborted) return;
      if (reason instanceof Error && reason.message === 'TIMEOUT') {
        setReportError('报告生成时间较长，可能仍在后台生成。请稍后点击「重新查询」查看结果，不会重复计费。');
      } else {
        setReportError(clientErrorMessage(reason, '学习报告生成失败'));
      }
    } finally {
      if (runId === reportRunRef.current) {
        setReportBusy(false);
        setReportElapsedStart(null);
      }
    }
  }, [preview, reportBusy, session]);

  // 显式重试入口：失败/超时后由用户触发，清空错误并强制重新查询（后端对「已生成的新鲜报告」直接复用，不重复付费）。
  const retryReport = useCallback(() => {
    if (reportBusy) return;
    setReportError('');
    void loadReport(true);
  }, [reportBusy, loadReport]);

  useEffect(() => {
    if (reportOpen && session) void loadReport();
  }, [loadReport, reportOpen, session]);

  // 卸载/离开时停止前端等待：递增 runId 使在途结果全部成为「迟到」，并 abort 前端请求。
  useEffect(() => {
    return () => {
      reportRunRef.current += 1;
      reportAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!routeBase || !session) return;
    router.prefetch(routeHref('map'));
    router.prefetch(routeHref('report'));
    session.steps.filter((step) => step.status !== 'locked').forEach((step) => router.prefetch(routeHref(`step/${step.stepId}`)));
  }, [routeBase, routeHref, router, session]);

  const goToMap = () => routeBase ? router.push(routeHref('map')) : setActiveStep(null);
  const goToStep = (stepId: number) => routeBase ? router.push(routeHref(`step/${stepId}`)) : setActiveStep(stepId);
  const openReport = () => {
    if (routeBase) router.push(routeHref('report'));
    else setReportOpen(true);
  };
  const closeReport = () => {
    if (routeBase) router.push(routeHref('map'));
    else setReportOpen(false);
  };

  if (loading && !session) {
    return (
      <div className="student-agent-app min-h-screen bg-background font-sans">
        <PageBackground />
        <main className="min-h-screen flex items-center justify-center"><p className="text-sm text-muted-foreground font-bold inline-flex items-center gap-2"><LoaderCircle className="w-4 h-4 spin" />正在进入实验地图…</p></main>
      </div>
    );
  }

  if ((error && !session) || !session) {
    return (
      <div className="min-h-screen bg-background font-sans">
        <PageBackground />
        <main className="min-h-screen flex items-center justify-center p-6">
          <div className="rounded-2xl bg-card border border-border shadow-card p-6 max-w-md w-full text-center">
            <p className="text-sm font-bold flex items-center justify-center gap-2 text-warning"><CircleAlert className="w-4 h-4" />{error || '实验会话不可用'}</p>
            <button type="button" onClick={() => void loadSession()} className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-card hover:opacity-90 transition-opacity cursor-pointer">重新加载</button>
          </div>
        </main>
      </div>
    );
  }

  if (activeStep) {
    return (
      <StepWorkstation
        key={session.sessionId + ":" + activeStep}
        session={session}
        stepId={activeStep}
        catalog={courseContent.steps}
        preview={preview}
        canSwitchToTeacher={canSwitchToTeacher}
        onOpenReport={openReport}
        onBack={goToMap}
        onSessionUpdate={setSession}
        onNextStep={goToStep}
      />
    );
  }

  const handleLogout = async () => {
    try { await platformLogout(); } catch { /* 退出失败也回到登录页 */ }
    window.location.replace('/login');
  };
  const tutorStep = courseContent.steps.find((step) => step.id === session.currentStep) ?? getExperimentStep(session.currentStep);

  if (reportPage) {
    return (
      <div className="student-agent-app min-h-screen bg-background text-foreground font-sans">
        <PageBackground />
        <StudyReport
          name={session.studentName}
          sessionId={session.sessionId}
          preview={preview}
          markdown={reportMarkdown}
          markdownBusy={reportBusy}
          markdownError={reportError}
          reportElapsedStart={reportElapsedStart}
          onRetryMarkdown={retryReport}
          syncNotice={reportSyncNotice}
          onClose={closeReport}
          standalone
          practiceMode={practiceMode}
          canSwitchToTeacher={canSwitchToTeacher}
        />
        <GlobalAiTutor sessionId={session.sessionId} step={tutorStep} mode="review" messages={session.messages} preview={preview} />
      </div>
    );
  }

  return (
    <div className="student-agent-app min-h-screen bg-background text-foreground font-sans">
      <PageBackground />
      <ExperimentMap
        steps={session.steps}
        catalog={courseContent.steps}
        currentStep={session.currentStep}
        completed={session.completed}
        demo={demo}
        practiceMode={practiceMode}
        canSwitchToTeacher={canSwitchToTeacher}
        onOpenStep={goToStep}
        onOpenReport={openReport}
        onLogout={demo ? undefined : () => void handleLogout()}
      />
      <GlobalAiTutor sessionId={session.sessionId} step={tutorStep} mode="task" messages={session.messages} preview={preview} />

      {reportOpen && (
        <StudyReport
          name={session.studentName}
          sessionId={session.sessionId}
          preview={preview}
          markdown={reportMarkdown}
          markdownBusy={reportBusy}
          markdownError={reportError}
          reportElapsedStart={reportElapsedStart}
          onRetryMarkdown={retryReport}
          syncNotice={reportSyncNotice}
          onClose={closeReport}
          practiceMode={practiceMode}
          canSwitchToTeacher={canSwitchToTeacher}
        />
      )}
    </div>
  );
}
