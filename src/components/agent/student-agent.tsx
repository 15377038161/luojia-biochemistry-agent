'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import PageBackground from '@/components/page-background';
import StudyReport from '@/components/student/study-report';
import ExperimentMap from '@/components/student/experiment-map';
import StepWorkstation from '@/components/student/step-workstation';
import type { ApiResult, StepProgress, StudentSessionView } from '@/domain/agent';
import type { CourseContentPayload } from '@/domain/course-content';
import { defaultCourseContent } from '@/domain/course-content';
import { dispatchChaoxingTaskflow } from '@/lib/chaoxing-taskflow-client';
import type { ChaoxingTaskflowPayload } from '@/lib/chaoxing-taskflow-contract';
import { clientErrorMessage } from '@/lib/client-request';

interface Props {
  displayName: string;
  demo?: boolean;
  preview?: boolean;
  practiceMode?: boolean;
  routeBase?: string;
  initialStep?: number;
  reportPage?: boolean;
}

type Api<T> = ApiResult<T>;

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json() as Api<T>;
  if (!payload.ok) throw new Error(payload.error.message);
  return payload.data;
}

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

export default function StudentAgent({ displayName, demo = false, preview = false, practiceMode = false, routeBase, initialStep, reportPage = false }: Props) {
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
  const [courseContent, setCourseContent] = useState<CourseContentPayload>(defaultCourseContent());
  const routeHref = useCallback((path: string) => `${routeBase}/${path}${preview ? '?preview=1' : ''}`, [preview, routeBase]);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const sessionEndpoint = practiceMode ? '/api/teacher/practice-session' : '/api/student/session';
      const response = await fetch(sessionEndpoint);
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
    void fetch(`/api/student/content?sessionId=${encodeURIComponent(session.sessionId)}`)
      .then((response) => response.json() as Promise<Api<CourseContentPayload>>)
      .then((payload) => { if (!cancelled && payload.ok) setCourseContent(payload.data); })
      .catch(() => { /* 内容服务异常时继续使用内置已校验版本。 */ });
    return () => { cancelled = true; };
  }, [preview, session]);

  const loadReport = useCallback(async () => {
    if (!session || reportMarkdown || reportBusy) return;
    setReportBusy(true);
    setReportError('');
    if (preview) {
      setReportMarkdown(PREVIEW_REPORT_MARKDOWN);
      setReportBusy(false);
      return;
    }
    try {
      const payload = await apiPost<{ rendered_markdown?: string; content?: string; chaoxingTaskflow?: ChaoxingTaskflowPayload }>('/api/student/report', { sessionId: session.sessionId });
      setReportMarkdown(payload.rendered_markdown || payload.content || '报告内容为空。');
      if (payload.chaoxingTaskflow) {
        try {
          const dispatch = await dispatchChaoxingTaskflow(payload.chaoxingTaskflow);
          setReportSyncNotice(dispatch.detail);
        } catch {
          setReportSyncNotice('学习报告已保存；超星网页桥接暂不可用，服务器同步队列会保留记录。');
        }
      }
    } catch (reason) {
      setReportError(clientErrorMessage(reason, '学习报告生成失败'));
    } finally {
      setReportBusy(false);
    }
  }, [preview, reportBusy, reportMarkdown, session]);

  useEffect(() => {
    if (reportOpen && session) void loadReport();
  }, [loadReport, reportOpen, session]);

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
        session={session}
        stepId={activeStep}
        catalog={courseContent.steps}
        preview={preview}
        onOpenReport={openReport}
        onBack={goToMap}
        onSessionUpdate={setSession}
      />
    );
  }

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* 退出失败也回到首页 */ }
    window.location.replace('/');
  };

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
          syncNotice={reportSyncNotice}
          onClose={closeReport}
          standalone
          practiceMode={practiceMode}
        />
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
        onOpenStep={goToStep}
        onOpenReport={openReport}
        onLogout={demo ? undefined : () => void handleLogout()}
      />

      {reportOpen && (
        <StudyReport
          name={session.studentName}
          sessionId={session.sessionId}
          preview={preview}
          markdown={reportMarkdown}
          markdownBusy={reportBusy}
          markdownError={reportError}
          syncNotice={reportSyncNotice}
          onClose={closeReport}
          practiceMode={practiceMode}
        />
      )}
    </div>
  );
}
