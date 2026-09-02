'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpenText, CheckCircle2, ChevronRight, FlaskConical, GraduationCap, History, Home, LayoutDashboard, LoaderCircle, PenLine, Radar, Scale, Search, Users, CircleAlert, X } from 'lucide-react';
import { experimentSteps } from '@/domain/experiment';
import type { ApiResult } from '@/domain/agent';
import type { TeacherOverview, TeacherStudentDetail, TeacherStudentOverview } from '@/app/api/teacher/overview/route';
import LogoutButton from '@/components/logout-button';
import PageBackground from '@/components/page-background';
import BrandLockup from '@/components/brand-lockup';
import ContentManager from '@/components/teacher/content-manager';
import GradeReviewPanel from '@/components/teacher/grade-review-panel';
import { clientErrorMessage } from '@/lib/client-request';

type TeacherView = 'overview' | 'students' | 'reviews' | 'content';
interface Props { displayName: string; demo: boolean; preview?: boolean; view?: TeacherView }

const DIMENSION_LABELS: Array<{ key: 'knowledge' | 'operation' | 'decision' | 'troubleshooting' | 'analysis'; label: string; max: number }> = [
  { key: 'knowledge', label: '知识理解', max: 20 },
  { key: 'operation', label: '操作描述', max: 30 },
  { key: 'decision', label: '决策能力', max: 20 },
  { key: 'troubleshooting', label: '问题解决', max: 15 },
  { key: 'analysis', label: '结果分析与判断', max: 15 },
];

const NAV_ITEMS = [
  { label: '教学概览', icon: LayoutDashboard, view: 'overview' as const, href: '/teacher/dashboard' },
  { label: '学生管理', icon: Users, view: 'students' as const, href: '/teacher/students' },
  { label: '成绩复核', icon: Scale, view: 'reviews' as const, href: '/teacher/reviews' },
  { label: '内容管理', icon: BookOpenText, view: 'content' as const, href: '/teacher/content' },
];

function mockGate(status: 'passed' | 'current' | 'locked', stepNo: number, decision?: 'pass' | 'revise', totalScore?: number) {
  return { stepNo, status, decision, totalScore, requiresReview: false, reviewed: decision === 'pass' };
}

function previewOverview(): TeacherOverview {
  const students: TeacherStudentOverview[] = [
    {
      sessionId: 'preview-1', name: '张明轩', studentNo: '2023302110041', currentStep: 5, completed: false,
      majorName: '生物技术', gradeName: '2023级', className: '生物技术1班',
      gates: [mockGate('passed', 1, 'pass', 88), mockGate('passed', 2, 'pass', 85), mockGate('passed', 3, 'pass', 82), mockGate('passed', 4, 'revise', 64), mockGate('current', 5), mockGate('locked', 6), mockGate('locked', 7), mockGate('locked', 8)],
      detail: {
        stepNo: 4, evaluationId: 'preview-eval-1', decision: 'revise', totalScore: 64,
        scores: { knowledge: 15, operation: 19, decision: 14, troubleshooting: 9, analysis: 10 },
        missingPoints: ['超声破碎缺少功率与间隔参数', 'SDS-PAGE 胶浓度与电泳条件描述模糊'],
        studentFeedback: '整体流程方向正确，但关键参数缺失较多，请补充超声功率、间隔时间与电泳条件后重新提交。',
        attempts: [
          { versionNo: 1, answer: '取菌液离心收集，重悬后超声破碎，跑个胶看看。' },
          { versionNo: 2, answer: '取 5 mL 诱导菌液 8000 rpm 离心 5 分钟收集菌体，用 Binding Buffer 重悬后冰上超声破碎（功率 40%，工作 3 秒间隔 5 秒，共 15 分钟），离心取上清进行 SDS-PAGE 验证。' },
        ],
        reviewed: false,
      },
    },
    {
      sessionId: 'preview-2', name: '李思远', studentNo: '2023302110027', currentStep: 4, completed: false,
      majorName: '生物技术', gradeName: '2023级', className: '生物技术1班',
      gates: [mockGate('passed', 1, 'pass', 92), mockGate('passed', 2, 'pass', 90), mockGate('passed', 3, 'pass', 87), mockGate('current', 4), mockGate('locked', 5), mockGate('locked', 6), mockGate('locked', 7), mockGate('locked', 8)],
      detail: {
        stepNo: 3, evaluationId: 'preview-eval-2', decision: 'pass', totalScore: 87,
        scores: { knowledge: 18, operation: 26, decision: 17, troubleshooting: 13, analysis: 13 },
        missingPoints: [],
        studentFeedback: '转化与诱导描述完整，IPTG 浓度与诱导温度均准确，继续保持。',
        attempts: [{ versionNo: 1, answer: '将连接产物加入 BL21 感受态细胞，冰浴 30 分钟后 42℃ 热激 90 秒，复苏 1 小时后涂板；挑单菌落接种，OD600 达 0.6 时加入 0.5 mmol/L IPTG，16℃ 诱导 16 小时。' }],
        reviewed: true,
      },
    },
    {
      sessionId: 'preview-3', name: '王梓涵', studentNo: '2023302110088', currentStep: 8, completed: true,
      majorName: '生物技术', gradeName: '2023级', className: '生物技术2班',
      gates: [1, 2, 3, 4, 5, 6, 7, 8].map((stepNo) => mockGate('passed', stepNo, 'pass', 95 - stepNo)),
      detail: null,
    },
    {
      sessionId: 'preview-4', name: '陈嘉树', studentNo: '2023302110012', currentStep: 3, completed: false,
      majorName: '生物科学', gradeName: '2023级', className: '生物科学1班',
      gates: [mockGate('passed', 1, 'pass', 80), mockGate('passed', 2, 'revise', 58), mockGate('current', 3), mockGate('locked', 4), mockGate('locked', 5), mockGate('locked', 6), mockGate('locked', 7), mockGate('locked', 8)],
      detail: {
        stepNo: 2, evaluationId: 'preview-eval-3', decision: 'revise', totalScore: 58,
        scores: { knowledge: 13, operation: 17, decision: 12, troubleshooting: 8, analysis: 8 },
        missingPoints: ['未说明载体与目的片段的连接方向', '缺少酶切验证方法'],
        studentFeedback: '载体构建缺少连接方向与酶切验证说明，请补充后重新提交。',
        attempts: [{ versionNo: 1, answer: '把目的基因连到 pET-28a(+) 上，转化后挑菌落送测序验证。' }],
        reviewed: false,
      },
    },
    {
      sessionId: 'preview-5', name: '刘一桐', studentNo: '2023302110056', currentStep: 1, completed: false,
      majorName: '生物科学', gradeName: '2024级', className: '生物科学1班',
      gates: [mockGate('current', 1), mockGate('locked', 2), mockGate('locked', 3), mockGate('locked', 4), mockGate('locked', 5), mockGate('locked', 6), mockGate('locked', 7), mockGate('locked', 8)],
      detail: null,
    },
  ];
  return {
    totalStudents: students.length,
    pendingReviews: 2,
    weakestGate: { stepNo: 4, count: 2 },
    students,
    dimensions: {
      majors: ['生物技术', '生物科学'],
      grades: ['2023级', '2024级'],
      classes: ['生物技术1班', '生物技术2班', '生物科学1班'],
    },
  };
}

function gateChipClass(student: TeacherStudentOverview, stepNo: number): string {
  const gate = student.gates.find((item) => item.stepNo === stepNo);
  if (!gate || gate.status === 'locked') return 'bg-muted text-muted-foreground';
  if (gate.decision === 'revise') return 'bg-warning/10 text-warning';
  if (gate.decision === 'teacher_review') return 'bg-secondary-container text-secondary';
  if (gate.status === 'current') return 'bg-primary-container text-primary';
  return 'bg-success/10 text-success';
}

function statusBadge(student: TeacherStudentOverview): { text: string; className: string } {
  if (student.completed) return { text: '已完成 · 全部 8 步', className: 'bg-success/10 text-success' };
  if (student.detail?.totalScore != null) {
    const score = student.detail.totalScore;
    const grade = score >= 80 ? '良好' : score >= 60 ? '中等' : '待提高';
    return { text: `${grade} · ${score} 分`, className: score >= 60 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning' };
  }
  return { text: '进行中', className: 'bg-primary-container text-primary' };
}

export default function TeacherAgent({ displayName, demo, preview = false, view = 'overview' }: Props) {
  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [majorFilter, setMajorFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [planTab, setPlanTab] = useState<'raw' | 'ai' | 'final'>('raw');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [dateText, setDateText] = useState('');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const loadOverview = useCallback(async () => {
    if (preview) { setOverview(previewOverview()); setSelectedId('preview-1'); return; }
    try {
      const response = await fetch('/api/teacher/overview');
      const payload = await response.json() as ApiResult<TeacherOverview>;
      if (!payload.ok) throw new Error(payload.error.message);
      setOverview(payload.data);
      setSelectedId((current) => current || payload.data.students[0]?.sessionId || null);
    } catch (reason) {
      setError(clientErrorMessage(reason, '加载班级数据失败'));
    }
  }, [preview]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => {
    const now = new Date();
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    setDateText(`${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 星期${weekday}`);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!mobileDetailOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileDetailOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileDetailOpen]);

  const students = overview?.students || [];
  const filtered = useMemo(() => {
    const keyword = filter.trim();
    return students.filter((item) => {
      const matchesKeyword = !keyword || item.name.includes(keyword) || item.studentNo.includes(keyword);
      return matchesKeyword
        && (!majorFilter || item.majorName === majorFilter)
        && (!gradeFilter || item.gradeName === gradeFilter)
        && (!classFilter || item.className === classFilter);
    });
  }, [students, filter, majorFilter, gradeFilter, classFilter]);
  const selected = students.find((item) => item.sessionId === selectedId) || null;
  const completedStudents = students.filter((item) => item.completed).length;
  const medianProgress = useMemo(() => {
    if (!students.length) return 0;
    const values = students.map((item) => item.gates.filter((gate) => gate.status === 'passed').length).sort((a, b) => a - b);
    return values[Math.floor((values.length - 1) / 2)] ?? 0;
  }, [students]);

  async function submitReview(decision: 'confirm' | 'adjust') {
    if (!selected?.detail || reviewBusy) return;
    const comment = reviewText.trim();
    if (!comment) { setToast('请先填写复核意见'); return; }
    if (preview) { setToast(demo || preview ? '演示模式：复核已记录' : '复核已记录'); setReviewText(''); return; }
    setReviewBusy(true);
    try {
      const response = await fetch('/api/teacher/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluationId: selected.detail.evaluationId, decision, comment }),
      });
      const payload = await response.json() as ApiResult<unknown>;
      if (!payload.ok) throw new Error(payload.error.message);
      setReviewText(''); setToast('复核已记录');
      await loadOverview();
    } catch (reason) {
      setToast(clientErrorMessage(reason, '提交复核失败'));
    } finally { setReviewBusy(false); }
  }

  function renderDetail(detail: TeacherStudentDetail) {
    const firstAttempt = detail.attempts[0];
    const lastAttempt = detail.attempts[detail.attempts.length - 1];
    return (
      <>
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-extrabold text-muted-foreground">文字方案 · 步骤 {detail.stepNo} 三版本对照</p>
            <div className="flex gap-1.5">
              {(['raw', 'ai', 'final'] as const).map((tab) => (
                <button key={tab} type="button" onClick={() => setPlanTab(tab)} className={`px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-colors ${planTab === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-surface-container-high'}`}>
                  {tab === 'raw' ? '原始方案' : tab === 'ai' ? 'AI 修改意见' : '最终提交'}
                </button>
              ))}
            </div>
          </div>
          {planTab === 'raw' && (
            <div className="mt-3 rounded-xl bg-muted/70 px-4 py-3.5 text-xs leading-relaxed text-muted-foreground">
              {firstAttempt ? <p className="whitespace-pre-wrap">{firstAttempt.answer}</p> : <p>该步骤暂无提交记录。</p>}
            </div>
          )}
          {planTab === 'ai' && (
            <div className="mt-3 rounded-xl bg-muted/70 px-4 py-3.5 text-xs leading-relaxed">
              {detail.missingPoints.length > 0 || detail.studentFeedback ? (
                <>
                  {detail.missingPoints.length > 0 && <ul className="list-disc pl-4 space-y-1 text-muted-foreground">{detail.missingPoints.map((point) => <li key={point}>{point}</li>)}</ul>}
                  {detail.studentFeedback && <p className={`text-muted-foreground ${detail.missingPoints.length ? 'mt-2' : ''}`}>{detail.studentFeedback}</p>}
                </>
              ) : <p className="text-muted-foreground">AI 评阅未提出修改意见。</p>}
            </div>
          )}
          {planTab === 'final' && (
            <div className="mt-3 rounded-xl bg-success/5 border border-success/30 px-4 py-3.5 text-xs leading-relaxed">
              {lastAttempt ? <p className="whitespace-pre-wrap">{lastAttempt.answer}</p> : <p className="text-muted-foreground">该步骤暂无提交记录。</p>}
            </div>
          )}
        </div>
        <div className="mt-5 grid md:grid-cols-2 gap-5">
          <div>
            <p className="text-xs font-extrabold text-muted-foreground">五维学习评价{detail.totalScore != null ? ` · 总分 ${detail.totalScore}` : ''}</p>
            <div className="mt-2.5 space-y-2">
              {DIMENSION_LABELS.map(({ key, label, max }) => {
                const score = detail.scores?.[key];
                return (
                  <div key={key} className="flex items-center gap-2.5 text-xs">
                    <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(Math.min((score ?? 0) / max, 1) * 100)}%` }} /></div>
                    <span className="w-12 text-right font-extrabold">{score == null ? '—' : `${score}/${max}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl bg-secondary-container/60 border border-secondary/30 px-4 py-4">
            <p className="text-xs font-extrabold text-secondary flex items-center gap-1.5"><PenLine className="w-3.5 h-3.5" /> 教师复核</p>
            {detail.reviewed ? (
              <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> 该记录已完成教师复核。</p>
            ) : (
              <>
                <textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="填写复核意见（必填）…" className="mt-2.5 w-full rounded-xl bg-card border-none px-3 py-2.5 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-secondary/40 resize-none" rows={4} />
                <div className="mt-2.5 flex gap-2">
                  <button type="button" disabled={reviewBusy} onClick={() => submitReview('confirm')} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-success text-primary-foreground text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"><CheckCircle2 className="w-3.5 h-3.5" /> 通过并给分</button>
                  <button type="button" disabled={reviewBusy} onClick={() => submitReview('adjust')} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-warning text-primary-foreground text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"><CircleAlert className="w-3.5 h-3.5" /> 退回修改</button>
                </div>
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  const firstName = displayName.trim().charAt(0) || '师';
  const pageTitle = view === 'students' ? '学生管理' : view === 'reviews' ? '成绩复核' : view === 'content' ? '课程内容管理' : '教学概览';
  const withPreview = (href: string) => preview ? `${href}?preview=1` : href;
  return (
    <div className="teacher-app flex min-h-screen" data-testid="teacher-dashboard">
      <PageBackground />
      <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-card/85 backdrop-blur border-r border-border/60 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border/60">
          <BrandLockup compact decorative />
          <span className="leading-tight"><span className="block font-bold text-sm">珞珈生化 · 教学工作台</span><span className="block text-xs text-muted-foreground">八步文字实验学习分析</span></span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 text-sm font-medium overflow-y-auto">
          {NAV_ITEMS.map(({ label, icon: Icon, href, view: itemView }) => (
            <Link key={label} href={withPreview(href)} className={`w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-left transition-colors ${view === itemView ? 'bg-gradient-to-r from-primary to-primary/85 text-primary-foreground shadow-card' : 'text-muted-foreground hover:bg-muted'}`}>
              <Icon className="w-4 h-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-border/60">
          <div className="flex items-center gap-2.5 rounded-xl bg-muted/80 px-3 py-2.5">
            <span className="w-9 h-9 rounded-full bg-secondary-container text-secondary flex items-center justify-center text-sm font-bold">{firstName}</span>
            <span className="leading-tight flex-1"><span className="block text-sm font-bold">{displayName} <span className="text-xs font-medium text-muted-foreground">教师</span></span><span className="block text-xs text-muted-foreground">生物化学教研组</span></span>
            <LogoutButton />
          </div>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b border-border/60">
          <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            <div className="teacher-header-title">
              <span className="teacher-header-logo lg:hidden"><BrandLockup compact decorative /></span>
              <span><h1 className="font-extrabold text-base">{pageTitle}</h1><p className="text-xs text-muted-foreground"><span className="hidden sm:inline">{displayName} · </span>{dateText}</p></span>
            </div>
            <div className="flex items-center gap-2">
              <Link href={preview ? '/student/map?preview=1' : '/student/map'} className="teacher-mode-switch"><FlaskConical className="w-4 h-4" /><span>学生端</span></Link>
              <Link href="/" aria-label="返回首页" className="min-w-12 min-h-12 inline-flex items-center justify-center rounded-xl border border-border bg-card text-primary"><Home className="w-4 h-4" /></Link>
              {demo && <span className="px-3 py-2 rounded-lg bg-warning/10 text-warning text-xs font-bold">演示环境</span>}
               <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-xs font-bold"><GraduationCap className="w-3.5 h-3.5 text-primary" /> 武汉大学 · 生物化学实验</span>
              <div className="lg:hidden"><LogoutButton /></div>
            </div>
          </div>
        </header>
        <main className="px-4 sm:px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
          <nav className="teacher-mobile-nav lg:hidden" aria-label="教师工作台页面导航">
            {NAV_ITEMS.map(({ label, icon: Icon, href, view: itemView }) => <Link key={href} href={withPreview(href)} aria-current={view === itemView ? 'page' : undefined}><Icon className="w-4 h-4" />{label}</Link>)}
          </nav>

          {view === 'overview' && <>
          <section className="teacher-page-intro">
            <div><p>TEACHING PULSE</p><h2>先看今天最需要处理的教学信号</h2><span>概览只保留关键指标与快捷入口，学生明细、复核和内容编辑分别进入独立页面。</span></div>
            <Link href={withPreview('/teacher/students')}>进入学生管理 <ChevronRight className="w-4 h-4" /></Link>
          </section>
          <section id="teacher-overview" className="teacher-overview-section scroll-mt-24">
            {overview ? (
              <div className="teacher-metric-grid">
                <article><span className="teacher-metric-icon metric-blue"><Users className="w-5 h-5" /></span><div><strong>{overview.totalStudents}</strong><small>学生总数</small></div></article>
                <article><span className="teacher-metric-icon metric-coral"><PenLine className="w-5 h-5" /></span><div><strong>{overview.pendingReviews}</strong><small>待复核记录</small></div></article>
                <article><span className="teacher-metric-icon metric-mint"><CheckCircle2 className="w-5 h-5" /></span><div><strong>{completedStudents}</strong><small>已完成八步</small></div></article>
                <article><span className="teacher-metric-icon metric-warm"><Radar className="w-5 h-5" /></span><div><strong>{overview.weakestGate ? `Gate ${overview.weakestGate.stepNo}` : `${medianProgress} / 8`}</strong><small>{overview.weakestGate ? '班级薄弱点' : '中位进度'}</small></div></article>
              </div>
            ) : <div className="teacher-metric-loading">正在加载班级概览…</div>}
          </section>
          <section className="teacher-route-cards" aria-label="教师常用工作入口">
            <Link href={withPreview('/teacher/students')}><span><Users /></span><div><small>学生管理</small><h3>按专业、年级、班级定位学生</h3><p>查看八步进度、AI 评价证据与个人学习轨迹。</p></div><ChevronRight /></Link>
            <Link href={withPreview('/teacher/reviews')}><span><Scale /></span><div><small>待办处理</small><h3>{overview?.pendingReviews ?? '—'} 条记录等待复核</h3><p>集中处理成绩异议与教师最终认定。</p></div><ChevronRight /></Link>
            <Link href={withPreview('/teacher/content')}><span><BookOpenText /></span><div><small>课程建设</small><h3>维护八步实验内容</h3><p>编辑评分点、Gate 规则与案例素材后校验发布。</p></div><ChevronRight /></Link>
          </section>
          </>}

          {error && <div className="rounded-xl bg-destructive/10 text-destructive text-xs font-bold px-4 py-3 flex items-center gap-2"><CircleAlert className="w-4 h-4" /> {error}</div>}

          {view === 'students' && <>
          <section className="teacher-page-intro compact">
            <div><p>STUDENT DIRECTORY</p><h2>按学籍维度快速定位目标学生</h2><span>筛选范围来自学习通身份与课程成员数据；未返回的字段会归入“待同步”，不使用猜测值。</span></div>
          </section>
          <section className="teacher-filter-bar" aria-label="学生筛选">
            <label className="teacher-search"><Search /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索姓名或学号" /></label>
            <label><span>专业</span><select value={majorFilter} onChange={(event) => setMajorFilter(event.target.value)}><option value="">全部专业</option>{overview?.dimensions.majors.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>年级</span><select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}><option value="">全部年级</option>{overview?.dimensions.grades.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>班级</span><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">全部班级</option>{overview?.dimensions.classes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <button type="button" onClick={() => { setFilter(''); setMajorFilter(''); setGradeFilter(''); setClassFilter(''); }}>重置</button>
            <strong>{filtered.length} 名学生</strong>
          </section>
          <section id="student-progress" className="scroll-mt-24 grid lg:grid-cols-[420px_1fr] gap-5 items-start">
            <div className="rounded-2xl bg-card/90 backdrop-blur border border-border/60 shadow-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> 学生文字推演进度 · 8 Gate</h2>
              </div>
              <div className="mt-4 space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                {!overview && <div className="text-xs text-muted-foreground flex items-center gap-2"><LoaderCircle className="w-4 h-4 animate-spin" /> 正在加载班级记录…</div>}
                {overview && filtered.length === 0 && <div className="text-xs text-muted-foreground">没有匹配的学生记录。</div>}
                {filtered.map((student) => {
                  const badge = statusBadge(student);
                  return (
                    <button key={student.sessionId} type="button" onClick={() => { setSelectedId(student.sessionId); setPlanTab('raw'); setMobileDetailOpen(true); }} className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors cursor-pointer ${student.sessionId === selectedId ? 'border-primary/50 bg-primary-container/40' : 'border-border/60 bg-card hover:bg-muted/60'}`}>
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 shrink-0 rounded-full bg-primary-container text-primary font-black flex items-center justify-center text-sm">{student.name.charAt(0)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-extrabold">{student.name}<span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.className}`}>{badge.text}</span></span>
                          <span className="block text-xs text-muted-foreground mt-0.5">{student.majorName} · {student.gradeName} · {student.className}</span>
                          <span className="block text-[11px] text-muted-foreground/80 mt-0.5">学号 {student.studentNo || '—'} · 完成 {student.gates.filter((gate) => gate.status === 'passed').length} / 8 步</span>
                        </span>
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        {student.gates.map((gate) => (
                          <span key={gate.stepNo} title={`Gate ${gate.stepNo} ${experimentSteps[gate.stepNo - 1]?.shortTitle || ''}`} className={`flex-1 h-1.5 rounded-full ${gate.decision === 'revise' ? 'bg-warning' : gate.status === 'passed' ? 'bg-success' : gate.status === 'current' ? 'bg-primary' : 'bg-muted'}`} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div id="review-detail" role="dialog" aria-label="学生复核详情" aria-modal={mobileDetailOpen ? true : undefined} className={`teacher-review-detail scroll-mt-24 rounded-2xl bg-card/90 backdrop-blur border border-border/60 shadow-card p-5 sm:p-6 ${mobileDetailOpen ? 'is-open' : ''}`}>
              <button type="button" className="teacher-review-close lg:hidden" aria-label="关闭学生复核详情" onClick={() => setMobileDetailOpen(false)}><X className="w-5 h-5" /></button>
              {selected ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-11 h-11 rounded-full bg-primary-container text-primary font-black flex items-center justify-center text-lg">{selected.name.charAt(0)}</span>
                    <div>
                      <p className="font-extrabold flex items-center gap-2">{selected.name}<span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusBadge(selected).className}`}>{statusBadge(selected).text}</span></p>
                      <p className="text-xs text-muted-foreground mt-0.5">{selected.majorName} · {selected.gradeName} · {selected.className}</p>
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5">学号 {selected.studentNo || '—'} · 完成 {selected.gates.filter((gate) => gate.status === 'passed').length} / 8 步</p>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><History className="w-4 h-4 text-primary" /> 全过程留痕</span>
                  </div>
                  <div className="mt-5">
                    <p className="text-xs font-extrabold text-muted-foreground">8 步 Gate 状态</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selected.gates.map((gate) => (
                        <span key={gate.stepNo} className={`px-2.5 py-1 rounded-full text-xs font-bold ${gateChipClass(selected, gate.stepNo)}`}>
                          Gate {gate.stepNo} · {experimentSteps[gate.stepNo - 1]?.shortTitle || ''}{gate.decision === 'revise' ? ' · 待修改' : ''}{gate.decision === 'pass' && gate.totalScore != null ? ` · ${gate.totalScore} 分` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                  {selected.detail ? renderDetail(selected.detail) : <p className="mt-5 text-xs text-muted-foreground">该学生还没有产生正式评阅记录。</p>}
                </>
              ) : (
                <div className="text-xs text-muted-foreground flex items-center gap-2">{overview ? '请选择左侧学生查看学习记录。' : <><LoaderCircle className="w-4 h-4 animate-spin" /> 正在加载…</>}</div>
              )}
            </div>
          </section>
          </>}

          {view === 'reviews' && <>
            <section className="teacher-page-intro compact"><div><p>REVIEW DESK</p><h2>成绩复核与最终认定</h2><span>集中处理学生异议，保留理由、教师意见与最终分数的完整证据链。</span></div></section>
            <GradeReviewPanel preview={preview} />
          </>}
          {view === 'content' && <>
            <section className="teacher-page-intro compact"><div><p>COURSE STUDIO</p><h2>八步课程内容与发布</h2><span>内容编辑从教学分析中独立出来，保存草稿、规则校验和正式发布在同一条工作流内完成。</span></div></section>
            <ContentManager preview={preview} />
          </>}
        </main>
      </div>
      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[80] px-4 py-2.5 rounded-xl bg-inverse text-inverse-foreground text-xs font-bold shadow-dialog">{toast}</div>}
    </div>
  );
}
