'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, Flag, Lock, LogOut, Map, Play, Radar, Home } from 'lucide-react';
import type { ExperimentStep, StepProgress } from '@/domain/agent';
import { experimentSteps } from '@/domain/experiment';

const NODE_LABELS = ['获取目标基因与设计引物', '构建pET28表达载体', '质粒转化与IPTG诱导表达', 'PAGE验证蛋白表达', '选择纯化方法', '蛋白纯化操作', '验证纯化是否达标', '测量蛋白质浓度'];
const NODE_POSITIONS = [
  { left: '17.5%', top: '25%' },
  { left: '37.5%', top: '25%' },
  { left: '57.5%', top: '25%' },
  { left: '77.5%', top: '25%' },
  { left: '77.5%', top: '75%' },
  { left: '57.5%', top: '75%' },
  { left: '37.5%', top: '75%' },
  { left: '17.5%', top: '75%' },
];

type NodeState = 'done' | 'cur' | 'revise' | 'lock';

function StepIllustration({ stepId }: { stepId: number }) {
  return <svg aria-hidden viewBox="0 0 120 96" className="step-illustration"><use href={`/illustrations/step-icons-v4.svg#step-${stepId}`} /></svg>;
}

interface Props {
  steps: StepProgress[];
  catalog?: ExperimentStep[];
  currentStep: number;
  completed: boolean;
  demo?: boolean;
  practiceMode?: boolean;
  onOpenStep: (stepId: number) => void;
  onOpenReport: () => void;
  onLogout?: () => void;
}

export default function ExperimentMap({ steps, catalog = experimentSteps, currentStep, completed, demo = false, practiceMode = false, onOpenStep, onOpenReport, onLogout }: Props) {
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function showToast(text: string) {
    setToast(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 2400);
  }

  function nodeState(stepId: number): NodeState {
    const progress = steps.find((item) => item.stepId === stepId);
    if (completed || progress?.status === 'passed') return 'done';
    if (progress?.status === 'active' && progress.attemptCount > 0) return 'revise';
    if (progress?.status === 'active' || progress?.status === 'teacher_review') return 'cur';
    if (stepId === currentStep && !completed) return 'cur';
    return 'lock';
  }

  function handleNode(stepId: number) {
    const state = nodeState(stepId);
    if (state === 'cur' || state === 'revise') { onOpenStep(stepId); return; }
    if (state === 'done') { onOpenStep(stepId); return; }
    showToast(`步骤${stepId}将在通过前一步 Gate 后解锁`);
  }

  const doneCount = steps.filter((step) => step.status === 'passed').length;
  const lockCount = Math.max(0, 8 - doneCount - (completed ? 0 : 1));
  const currentMeta = experimentSteps.find((step) => step.id === currentStep);

  function renderNode(stepId: number) {
    const state = nodeState(stepId);
    return (
      <button
        key={stepId}
        type="button"
        onClick={() => handleNode(stepId)}
        className={`map-node map-node-${state} absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer`}
        style={NODE_POSITIONS[stepId - 1]}
        aria-label={`步骤${stepId} ${catalog[stepId - 1]?.title ?? NODE_LABELS[stepId - 1]} ${state === 'done' ? '已完成' : state === 'revise' ? '待修订' : state === 'cur' ? '进行中' : '未解锁'}`}
      >
        <span className="map-node-visual">
          <StepIllustration stepId={stepId} />
          <span className="map-node-number">{stepId}</span>
          {state === 'done' && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-success text-primary-foreground flex items-center justify-center"><Check className="w-3 h-3" /></span>}
          {state === 'lock' && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-border text-foreground flex items-center justify-center"><Lock className="w-3 h-3" /></span>}
          {state === 'cur' && <span className="absolute -inset-1.5 rounded-full border-2 border-primary/40 animate-pulse" aria-hidden />}
        </span>
        <span className="map-node-copy"><strong>{catalog[stepId - 1]?.title ?? NODE_LABELS[stepId - 1]}</strong><small>{state === 'done' ? '已通过 · 可回看' : state === 'revise' ? '待修订 · 查看点评' : state === 'cur' ? '当前任务 · 点击进入' : '完成上一关后解锁'}</small></span>
      </button>
    );
  }

  return (
    <div className="notebook-map-page watercolor-student-map min-h-screen flex flex-col text-foreground font-sans">
      <header className="student-map-header sticky top-0 z-50 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-16 flex items-center justify-between gap-3">
          <Link href="/" aria-label="返回首页" className="flex items-center gap-1.5 min-w-11 min-h-11 px-3 rounded-xl bg-card border border-border text-xs font-bold text-muted-foreground shadow-card hover:bg-muted transition-colors shrink-0"><Home className="w-4 h-4" /><span className="hidden sm:inline">返回首页</span></Link>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
            <span className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0"><Map className="w-4.5 h-4.5" /></span>
            <div className="header-copy min-w-0"><h1 className="text-base sm:text-lg font-black leading-none truncate">八步文字推演</h1><p className="text-xs text-muted-foreground mt-1 truncate">一条主线 · 逐步描述 · Gate 把关</p></div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {practiceMode && <Link href="/teacher/dashboard" className="map-mode-switch">返回教学分析</Link>}
            {demo && <span className="hidden sm:inline-flex text-xs font-bold px-2 py-1 rounded-full bg-primary-container text-primary border border-primary/30">演示模式</span>}
            <button type="button" aria-label="打开学习报告" onClick={onOpenReport} className="flex items-center gap-1.5 min-w-11 min-h-11 px-3 rounded-xl bg-card border border-border text-xs font-bold text-muted-foreground shadow-card hover:bg-muted transition-colors shrink-0 cursor-pointer"><Radar className="w-4 h-4" /><span className="hidden sm:inline">学习报告</span></button>
            {onLogout && <button type="button" aria-label="退出登录" onClick={onLogout} className="flex items-center gap-1.5 min-w-11 min-h-11 px-3 rounded-xl bg-card border border-border text-xs font-bold text-muted-foreground shadow-card hover:bg-muted transition-colors shrink-0 cursor-pointer"><LogOut className="w-4 h-4" /><span className="hidden sm:inline">退出</span></button>}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        <section className="student-map-hero mt-5 sm:mt-7 text-left">
          <p className="relative z-[1] text-xs font-black text-secondary tracking-[.08em]">实验探险路线 · 8 STEP ROUTE</p>
          <h1 className="relative z-[1] mt-2 text-2xl sm:text-4xl font-black tracking-tight">重组蛋白表达与纯化<br className="sm:hidden" /> <span className="text-secondary">8 步文字实验</span></h1>
          <p className="relative z-[1] mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">观察课程案例、设计方案并逐步写清操作逻辑。这里训练的是实验思维，不要求真实动手或提交真实结果。</p>
          <p className="relative z-[1] mt-4 inline-flex flex-wrap items-center gap-2 text-xs font-bold px-3 py-2 rounded-full bg-card border border-border shadow-card">
            {practiceMode && <><span className="text-secondary">教师独立体验</span><span className="text-border">·</span></>}
            <span className="text-success">已完成 {doneCount} 步</span><span className="text-border">·</span><span className="text-primary">{completed ? '全部完成' : `当前：步骤${currentStep} ${currentMeta?.shortTitle || ''}`}</span><span className="text-border">·</span><span className="text-muted-foreground">待解锁 {lockCount} 步</span>
          </p>
        </section>

        <section className="desktop-route-board relative mt-6 hidden md:block p-4">
          <svg className="absolute -top-2 -left-2 w-24 h-24 text-primary opacity-20 pointer-events-none" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><path d="M30 5c0 25 40 25 40 50s-40 25-40 50" /><path d="M70 5c0 25-40 25-40 50s40 25 40 50" /><path d="M34 20h32M34 50h32M34 80h32" /></svg>
          <svg className="absolute bottom-0 -right-1 w-20 h-20 text-secondary opacity-20 pointer-events-none" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><path d="M40 10h20M45 10v25L20 80a8 8 0 0 0 7 12h46a8 8 0 0 0 7-12L55 35V10" /><path d="M30 65h40" /></svg>
          <svg className="absolute top-1/3 -right-2 w-14 h-14 text-primary opacity-15 pointer-events-none" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="4" aria-hidden><circle cx="30" cy="30" r="10" /><circle cx="70" cy="45" r="8" /><circle cx="40" cy="75" r="7" /><path d="M39 35l24 8M64 52l-18 16" /></svg>
          <div className="relative w-full" style={{ aspectRatio: '1200/560' }}>
            <svg viewBox="0 0 1200 560" className="absolute inset-0 w-full h-full" fill="none" aria-hidden>
              <path d="M 60 140 C 250 80 410 198 585 140 S 890 82 970 160 C 1040 238 1000 390 890 420 C 690 470 460 352 285 420 C 185 456 125 432 60 420" stroke="#c7e2f1" strokeWidth="24" strokeLinecap="round" />
              <path d="M 60 140 C 250 80 410 198 585 140 S 890 82 970 160 C 1040 238 1000 390 890 420 C 690 470 460 352 285 420 C 185 456 125 432 60 420" stroke="#fffdf8" strokeWidth="3" strokeDasharray="8 13" strokeLinecap="round" />
            </svg>
            <div className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: '5%', top: '25%' }}>
              <span className="w-10 h-10 rounded-full bg-secondary text-primary-foreground flex items-center justify-center shadow-card"><Play className="w-4 h-4" /></span>
              <span className="mt-1 text-xs font-black text-secondary">开始</span>
            </div>
            <div className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: '5%', top: '75%' }}>
              <span className="w-10 h-10 rounded-full bg-destructive text-primary-foreground flex items-center justify-center shadow-card"><Flag className="w-4 h-4" /></span>
              <span className="mt-1 text-xs font-black text-destructive">完成</span>
            </div>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(renderNode)}
          </div>
        </section>

        <section className="relative mt-5 md:hidden">
          <div className="mobile-step-list relative flex flex-col pl-10">
            <div className="absolute left-4 top-4 bottom-4 w-1 rounded-full bg-card border border-border" aria-hidden />
            {[1, 2, 3, 4, 5, 6, 7, 8].map((stepId) => {
              const state = nodeState(stepId);
              return (
                <button key={stepId} type="button" onClick={() => handleNode(stepId)} aria-label={`移动端 步骤${stepId} ${NODE_LABELS[stepId - 1]} ${state === 'done' ? '已完成' : state === 'revise' ? '待修订' : state === 'cur' ? '进行中' : '未解锁'}`} className={`mobile-route-card mobile-route-card-${state} relative text-left cursor-pointer`}>
                  <span className="mobile-route-icon">
                    <StepIllustration stepId={stepId} />
                    <span className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${state === 'lock' ? 'bg-border text-foreground' : state === 'done' ? 'bg-success text-primary-foreground' : 'bg-primary text-primary-foreground'}`}>{stepId}</span>
                    {state === 'lock' && <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-border text-foreground flex items-center justify-center"><Lock className="w-2.5 h-2.5" /></span>}
                  </span>
                  <span className="mobile-route-copy">
                    <span className="block text-xs font-bold leading-tight">{catalog[stepId - 1]?.title ?? NODE_LABELS[stepId - 1]}</span>
                    <span className="mobile-route-state">{state === 'done' ? '已通过 · 可回看' : state === 'revise' ? '待修订 · 查看点评' : state === 'cur' ? '当前任务 · 点击进入' : '通过前一步后解锁'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-5 py-3 rounded-xl bg-foreground text-background text-xs font-bold shadow-dialog transition-opacity duration-300 pointer-events-none ${toast ? 'opacity-100' : 'opacity-0'}`} role="status">{toast}</div>
    </div>
  );
}
