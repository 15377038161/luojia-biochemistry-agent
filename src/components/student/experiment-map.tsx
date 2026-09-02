'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, Flag, Play } from 'lucide-react';
import type { ExperimentStep, StepProgress } from '@/domain/agent';
import { experimentSteps } from '@/domain/experiment';
import StudentTopbar from '@/components/student/student-topbar';

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

type NodeState = 'done' | 'cur' | 'revise' | 'open';

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
  canSwitchToTeacher?: boolean;
  onOpenStep: (stepId: number) => void;
  onOpenReport: () => void;
  onLogout?: () => void;
}

export default function ExperimentMap({ steps, catalog = experimentSteps, currentStep, completed, demo = false, practiceMode = false, canSwitchToTeacher = false, onOpenStep, onOpenReport, onLogout }: Props) {
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
    return 'open';
  }

  function handleNode(stepId: number) {
    onOpenStep(stepId);
  }

  const doneCount = steps.filter((step) => step.status === 'passed').length;
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
        aria-label={`步骤${stepId} ${catalog[stepId - 1]?.title ?? NODE_LABELS[stepId - 1]} ${state === 'done' ? '已完成' : state === 'revise' ? '待修订' : '可进入'}`}
      >
        <span className="map-node-visual">
          <StepIllustration stepId={stepId} />
          <span className="map-node-number">{stepId}</span>
          {state === 'done' && <span className="map-node-status is-done"><Check aria-hidden /></span>}
          {/* lock state removed — all steps open */}
          {state === 'cur' && <span className="map-current-ring" aria-hidden />}
        </span>
        <span className="map-node-copy"><strong>{catalog[stepId - 1]?.title ?? NODE_LABELS[stepId - 1]}</strong><small>{state === 'done' ? '已通过 · 可回看' : state === 'revise' ? '待修订 · 查看点评' : '点击进入'}</small></span>
      </button>
    );
  }

  return (
    <div className="lab-map-page min-h-screen flex flex-col text-foreground font-sans">
      <StudentTopbar title="八步文字推演" subtitle="重组蛋白表达与纯化" onOpenReport={onOpenReport} onLogout={onLogout} showTeacherSwitch={canSwitchToTeacher} />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        <section className="student-map-hero mt-5 sm:mt-7 text-left">
          <div className="student-map-heading">
            <p>实验探险路线 · 8 STEP ROUTE</p>
            <h1>从实验问题出发，<br className="sm:hidden" />完成八步文字推演</h1>
            <span>观察课程案例、设计方案、接受 AI 点评并修订。这里只训练实验思维，不要求真实动手。</span>
          </div>
          <p className="student-map-progress">
            {practiceMode && <><span className="text-secondary">教师独立体验</span><span className="text-border">·</span></>}
            <span className="text-success">已完成 {doneCount} 步</span><span className="text-border">·</span><span className="text-primary">{completed ? '全部完成' : `当前：步骤${currentStep} ${currentMeta?.shortTitle || ''}`}</span><span className="text-border">·</span><span className="text-success">全部开放</span>
          </p>
          {demo && <span className="student-preview-badge">开发预览</span>}
          {practiceMode && <Link href="/teacher/dashboard" className="student-map-teacher-return">返回教学分析</Link>}
        </section>

        <section className="desktop-route-board relative mt-6 hidden md:block p-4">
          <div className="relative w-full" style={{ aspectRatio: '1200/560' }}>
            <svg viewBox="0 0 1200 560" className="absolute inset-0 w-full h-full" fill="none" aria-hidden>
              <path className="production-route-shadow" d="M 60 140 C 250 80 410 198 585 140 S 890 82 970 160 C 1040 238 1000 390 890 420 C 690 470 460 352 285 420 C 185 456 125 432 60 420" strokeLinecap="round" />
              <path className="production-route-main" d="M 60 140 C 250 80 410 198 585 140 S 890 82 970 160 C 1040 238 1000 390 890 420 C 690 470 460 352 285 420 C 185 456 125 432 60 420" strokeLinecap="round" />
              <path className="production-route-flow" d="M 60 140 C 250 80 410 198 585 140 S 890 82 970 160 C 1040 238 1000 390 890 420 C 690 470 460 352 285 420 C 185 456 125 432 60 420" strokeLinecap="round" />
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
          <div className="mobile-step-list relative flex flex-col">
            <div className="mobile-route-line" aria-hidden />
            {[1, 2, 3, 4, 5, 6, 7, 8].map((stepId) => {
              const state = nodeState(stepId);
              return (
                <button key={stepId} type="button" onClick={() => handleNode(stepId)} aria-label={`移动端 步骤${stepId} ${NODE_LABELS[stepId - 1]} ${state === 'done' ? '已完成' : state === 'revise' ? '待修订' : '可进入'}`} className={`mobile-route-card mobile-route-card-${state} relative text-left cursor-pointer`}>
                  <span className="mobile-route-icon">
                    <StepIllustration stepId={stepId} />
                    <span className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${state === 'done' ? 'bg-success text-primary-foreground' : 'bg-primary text-primary-foreground'}`}>{stepId}</span>
                  </span>
                  <span className="mobile-route-copy">
                    <span className="block text-xs font-bold leading-tight">{catalog[stepId - 1]?.title ?? NODE_LABELS[stepId - 1]}</span>
                    <span className="mobile-route-state">{state === 'done' ? '已通过 · 可回看' : state === 'revise' ? '待修订 · 查看点评' : '点击进入'}</span>
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
