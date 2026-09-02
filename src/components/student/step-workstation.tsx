'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CircleAlert, CircleHelp, Flag, GraduationCap, LoaderCircle, PenLine, Save } from 'lucide-react';
import type { ApiResult, StudentSessionView, TextEvaluation } from '@/domain/agent';
import type { ExperimentStep } from '@/domain/agent';
import { experimentSteps } from '@/domain/experiment';
import { getStepQuiz } from '@/domain/quiz';
import PageBackground from '@/components/page-background';
import StudentTopbar from '@/components/student/student-topbar';
import GlobalAiTutor from '@/components/student/global-ai-tutor';
import StepReviewReport from '@/components/student/step-review-report';
import { dispatchChaoxingTaskflow } from '@/lib/chaoxing-taskflow-client';
import type { ChaoxingTaskflowPayload } from '@/lib/chaoxing-taskflow-contract';
import { clientErrorMessage } from '@/lib/client-request';

const STAGE_LABELS = ['任务与原理', '知识检验', '分步文字推演', 'AI 点评与本步报告'];
const STAGE_MOBILE_LABELS = ['任务', '检验', '推演', '报告'];
const STAGE_ICONS = [BookOpen, CircleHelp, PenLine, Flag];
const STEP_BADGES = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
const MIN_DESC_LENGTH = 15;

async function api<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json() as ApiResult<T>;
  if (!payload.ok) throw new Error(payload.error.message);
  return payload.data;
}

interface Props {
  session: StudentSessionView;
  stepId: number;
  catalog?: ExperimentStep[];
  preview?: boolean;
  canSwitchToTeacher?: boolean;
  onBack: () => void;
  onSessionUpdate: (view: StudentSessionView) => void;
  onOpenReport?: () => void;
}

function previewEvaluation(step: ExperimentStep): TextEvaluation {
  return {
    schemaVersion: 'TextEvaluation.v2',
    decision: 'pass',
    confidence: 0.9,
    coveredPoints: step.keyPoints.slice(0, 3).map((point) => ({ rubricId: point.id, label: point.label, quote: '' })),
    missingPoints: step.keyPoints.slice(3, 4).map((point) => ({ rubricId: point.id, label: point.label, guidance: point.hints[2] })),
    incorrectPoints: [],
    ambiguousPhrases: [],
    safetyAlerts: [],
    questions: [step.keyPoints[4]?.hints[0] || '回顾本步结论如何影响下一步。'],
    studentFeedback: '这是功能预览：正式环境会调用大模型对照课程资料逐条评阅，并把结果计入五维总评。',
    teacherSummary: '',
    scores: { knowledge: 18, operation: 26, decision: 17, troubleshooting: 12, analysis: 12 },
    requiresTeacherReview: false,
    knowledgeChunkIds: [],
    detailedIssues: step.keyPoints.slice(3, 4).map((point) => ({
      dimension: point.dimension,
      kind: 'missing',
      title: point.label,
      evidence: { stepId: step.id, quote: '', attemptNo: 1 },
      scenario: `本次第${step.id}步描述未交代“${point.label}”的判断依据。`,
      impact: '方案的异常处理路径无法被复核。',
      causeBoundary: '只能说明本次文字信息不足，不推断学习习惯。',
      action: point.hints[2],
      check: `修订后应能定位到“${point.label}”对应的原因、动作与判断标准。`,
    })),
    strengths: step.keyPoints.slice(0, 3).map((point) => `已覆盖“${point.label}”。`),
    reasoningReview: '这是功能预览：正式评阅会给出完整推理点评。',
    standardAnswer: '本步参考要点：' + step.keyPoints.map((point) => point.label).join('；') + '。',
    improvedAnswer: '预览模式不提供改写示例；正式评阅会基于你的回答给出推荐改写。',
    knowledgeExplanation: '预览模式：正式评阅会结合知识点给出详细讲解。',
    nextAction: '预览通过后可进入下一步。',
  };
}

export default function StepWorkstation({ session, stepId, catalog = experimentSteps, preview = false, canSwitchToTeacher = false, onBack, onSessionUpdate, onOpenReport }: Props) {
  const step = catalog.find((item) => item.id === stepId) ?? experimentSteps[stepId - 1];
  const quiz = getStepQuiz(stepId);
  const [stage, setStage] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [descs, setDescs] = useState<Record<string, string>>({});
  const [hintLevel, setHintLevel] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [syncNotice, setSyncNotice] = useState('');
  const [railHint, setRailHint] = useState('');
  const [evaluation, setEvaluation] = useState<TextEvaluation | null>(null);
  const [draftNotice, setDraftNotice] = useState('草稿自动保存');
  const draftKey = `ljbio-desc-step-${stepId}`;
  const loadedDraft = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || loadedDraft.current) return;
    loadedDraft.current = true;
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) setDescs(JSON.parse(saved) as Record<string, string>);
    } catch { /* 草稿读取失败不影响主流程 */ }
  }, [draftKey]);

  useEffect(() => {
    if (!loadedDraft.current) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify(descs)); } catch { /* 存储不可用时忽略 */ }
  }, [descs, draftKey]);

  const quizOk = quiz.length > 0 && quiz.every((question) => quizAnswers[question.id] === question.answerIndex);
  const describedCount = step.keyPoints.filter((point) => (descs[point.id] || '').trim().length >= MIN_DESC_LENGTH).length;
  const descComplete = describedCount === step.keyPoints.length;
  const isCurrent = session.currentStep === stepId;
  const submittedAnswer = step.keyPoints.map((point) => `【${point.label}】${(descs[point.id] || '').trim()}`).join('\n');

  function stageUnlocked(index: number): boolean {
    if (index <= 1) return true;
    if (index === 2) return quizOk;
    return quizOk && descComplete && evaluation !== null;
  }

  function goTo(index: number) {
    if (stageUnlocked(index)) { setStage(index); setRailHint(''); return; }
    if (index === 2) setRailHint('先在「知识检验」答对全部题目，才能进入分步文字推演。');
    else setRailHint('先用自己的话完成全部子步骤描述并提交，AI 才会生成点评与本步报告。');
  }

  function pickQuiz(questionId: string, optionIndex: number) {
    if (quizAnswers[questionId] === getStepQuiz(stepId).find((item) => item.id === questionId)?.answerIndex) return;
    setQuizAnswers((value) => ({ ...value, [questionId]: optionIndex }));
  }

  function saveDraft() {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(descs));
      setDraftNotice('草稿已保存');
    } catch {
      setDraftNotice('当前浏览器无法保存草稿');
    }
  }

  async function submitEvaluation() {
    if (!descComplete || busy || !isCurrent) return;
    setBusy(true); setError(''); setSyncNotice('');
    const answer = submittedAnswer;
    if (preview) {
      setEvaluation(previewEvaluation(step)); setBusy(false); setStage(3); return;
    }
    try {
      const requestKey = crypto.randomUUID();
      const result = await api<{ evaluation: TextEvaluation; session: StudentSessionView; chaoxingTaskflow?: ChaoxingTaskflowPayload }>('/api/student/evaluate', { sessionId: session.sessionId, answer, requestId: requestKey });
      const lastIndex = result.session.messages.length - 1;
      if (lastIndex >= 0) result.session.messages[lastIndex] = { ...result.session.messages[lastIndex], evaluation: result.evaluation };
      setEvaluation(result.evaluation);
      onSessionUpdate(result.session);
      setStage(3);
      if (result.chaoxingTaskflow) {
        try {
          const dispatch = await dispatchChaoxingTaskflow(result.chaoxingTaskflow);
          setSyncNotice(dispatch.detail);
        } catch {
          setSyncNotice('本次评阅已保存；超星网页桥接暂不可用，服务器同步队列会保留记录。');
        }
      } else {
        setSyncNotice('本次记录已保存；非正式学生会话不会写入超星。');
      }
    } catch (reason) { setError(clientErrorMessage(reason, '评阅失败，请稍后重试')); }
    finally { setBusy(false); }
  }

  const gatePassed = evaluation?.decision === 'pass';

  return (
    <div className="workstation-shell watercolor-student-task text-foreground font-sans">
      <PageBackground />
      <StudentTopbar title={`步骤 ${stepId} · ${step.shortTitle}`} subtitle={`阶段 ${stage + 1} / ${STAGE_LABELS.length} · ${STAGE_LABELS[stage]}`} onBack={onBack} backLabel="实验地图" onOpenReport={onOpenReport} showTeacherSwitch={canSwitchToTeacher} />
      <div className="workstation-layout mx-auto max-w-[1500px] px-4 sm:px-6 py-4 pb-8">
        <main className="student-stage-canvas min-w-0">
        <header className="workstation-step-heading flex flex-wrap items-center gap-3">
          <div className="step-heading-copy"><p>当前学习任务</p><h1>{step.goal}</h1></div>
          <span className={`step-gate-state ${gatePassed ? 'is-passed' : 'is-pending'}`}><Flag aria-hidden />Gate {stepId} · {gatePassed ? '已通过' : '待通过'}</span>
        </header>

        <section className="workstation-card student-stage-navigation mt-4 rounded-2xl p-3">
          <div className="stage-strip flex flex-wrap gap-1.5">
            {STAGE_LABELS.map((label, index) => {
              const Icon = STAGE_ICONS[index];
              const unlocked = stageUnlocked(index);
              const active = stage === index;
              return (
                <button key={label} type="button" onClick={() => goTo(index)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${active ? 'bg-primary text-primary-foreground border-primary' : unlocked ? 'bg-card text-foreground border-border hover:bg-muted' : 'bg-muted text-muted-foreground border-border/60'}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="stage-label-desktop">{index + 1} {label}</span>
                  <span className="stage-label-mobile">{STAGE_MOBILE_LABELS[index]}</span>
                </button>
              );
            })}
          </div>
          {railHint && <p className="mt-2 text-xs font-bold text-warning flex items-center gap-1.5"><CircleAlert className="w-3.5 h-3.5 shrink-0" />{railHint}</p>}
        </section>

        {stage === 0 && (
          <section className="student-stage-panel student-stage-panel-task mt-4">
            <div className="rounded-2xl bg-primary-container/40 border border-primary/20 p-5">
              <p className="text-xs font-black text-primary bg-card/80 border border-primary/30 rounded-full px-2.5 py-1 inline-flex items-center gap-1"><BookOpen className="w-3 h-3" /> 引导级 · 任务情境</p>
              <h2 className="text-2xl font-bold tracking-tight mt-2">你在哪里？要回答什么问题？</h2>
              <p className="mt-2 text-sm leading-relaxed">{step.context}本步目标：{step.goal}</p>
            </div>
            <div className="rounded-2xl bg-card/90 border border-secondary/30 shadow-card p-5 mt-5">
              <h3 className="text-sm font-extrabold flex items-center gap-2"><GraduationCap className="w-4 h-4 text-secondary" /> 原理讲解</h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground/90">{step.principle}</p>
            </div>
            <div className="grid lg:grid-cols-2 gap-5 mt-5">
              {(() => {
                const knowledgePoint = step.keyPoints.find((point) => point.dimension === 'knowledge') ?? step.keyPoints[0];
                const decisionPoint = step.keyPoints.find((point) => point.dimension === 'decision') ?? step.keyPoints[step.keyPoints.length - 1];
                return (
                  <>
                    <div className="rounded-2xl bg-card/90 border border-border/60 shadow-card p-5">
                      <h3 className="text-sm font-extrabold flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" /> 理论概要 · {knowledgePoint.label}</h3>
                      <ul className="mt-3 space-y-2 text-xs leading-relaxed">
                        {knowledgePoint.hints.map((hint, index) => (
                          <li key={hint} className="flex gap-2"><span className="text-primary font-black">{index + 1}</span><span>{hint}</span></li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-2xl bg-card/90 border border-border/60 shadow-card p-5">
                      <h3 className="text-sm font-extrabold flex items-center gap-2"><BookOpen className="w-4 h-4 text-secondary" /> 理论概要 · {decisionPoint.label}</h3>
                      <ul className="mt-3 space-y-2 text-xs leading-relaxed">
                        {decisionPoint.hints.map((hint, index) => (
                          <li key={hint} className="flex gap-2"><span className="text-secondary font-black">{index + 1}</span><span>{hint}</span></li>
                        ))}
                        <li className="flex gap-2"><span className="text-secondary font-black">✓</span><span>通过后进入步骤{stepId < 8 ? STEP_BADGES[stepId] : '总结'}，本步记录计入五维总评。</span></li>
                      </ul>
                    </div>
                  </>
                );
              })()}
            </div>
          </section>
        )}

        {stage === 1 && (
          <section className="student-stage-panel student-stage-panel-quiz mt-4 rounded-2xl bg-card/90 border border-border/60 shadow-card p-6">
            <p className="text-xs font-black text-primary bg-primary-container/60 border border-primary/30 rounded-full px-2.5 py-1 inline-flex items-center gap-1"><CircleHelp className="w-3 h-3" /> 引导级 · 知识检验</p>
            <h2 className="text-lg font-bold mt-2">答对全部题目，解锁「分步文字推演」</h2>
            <p className="mt-1 text-xs text-muted-foreground">先确认基础概念，再用文字说明每个操作步骤与判断理由。</p>
            {quiz.map((question, qIndex) => {
              const picked = quizAnswers[question.id];
              const correct = picked === question.answerIndex;
              return (
                <div key={question.id} className="mt-4 rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-bold">Q{qIndex + 1} · {question.prompt}</p>
                  <div className="mt-3 grid gap-2">
                    {question.options.map((option, optionIndex) => {
                      const isPicked = picked === optionIndex;
                      const isAnswer = question.answerIndex === optionIndex;
                      const tone = picked === undefined ? 'border-border bg-card hover:bg-muted'
                        : isAnswer ? 'border-success bg-success/10 text-success'
                        : isPicked ? 'border-destructive bg-destructive/10 text-destructive'
                        : 'border-border bg-card opacity-70';
                      return (
                        <button key={option} type="button" onClick={() => pickQuiz(question.id, optionIndex)}
                          className={`w-full text-left px-4 py-3 rounded-xl border text-xs transition-colors cursor-pointer ${tone}`}>
                          {String.fromCharCode(65 + optionIndex)}. {option}
                        </button>
                      );
                    })}
                  </div>
                  {picked !== undefined && !correct && <p className="mt-2 text-xs font-bold text-warning flex items-start gap-1.5"><CircleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />{question.rationale} 再试一次。</p>}
                  {correct && <p className="mt-2 text-xs font-bold text-success flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />回答正确。{question.rationale}</p>}
                </div>
              );
            })}
          </section>
        )}

        {stage === 2 && (
          <section className="student-stage-panel student-stage-panel-simulation mt-4 rounded-2xl bg-card/90 border border-border/60 shadow-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-black text-primary-foreground bg-secondary border border-secondary/40 rounded-full px-2.5 py-1 inline-flex items-center gap-1"><PenLine className="w-3 h-3" /> 推演级 · 分步描述</p>
              <div className="ml-auto flex items-center gap-2 text-xs font-bold">
                <span className="px-2.5 py-1 rounded-full bg-primary-container text-primary">已描述 {describedCount} / {step.keyPoints.length} 步</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5"><CircleHelp className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />假设你正在设计本步方案，用自己的话逐条写清顺序、参数、安全要点和结果判断。答题期间 AI 助教暂时隐藏，避免提示影响独立作答。</p>
            <div className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${(describedCount / step.keyPoints.length) * 100}%` }} /></div>
            <p className="mt-2 text-right text-[11px] font-bold text-muted-foreground">{draftNotice}</p>
            {preview && (
              <div className="mt-3 flex justify-end">
                <button type="button"
                  onClick={() => setDescs(Object.fromEntries(step.keyPoints.map((point) => [point.id, `示例描述：${point.label}。${point.hints[0]}${point.hints[1] ? `补充：${point.hints[1]}` : ''}`])))}
                  className="text-xs px-3 py-1.5 rounded-full border border-primary/40 text-primary bg-primary-container hover:opacity-80 transition-opacity cursor-pointer">一键填入演示描述（仅预览）</button>
              </div>
            )}
            <div className="student-answer-grid mt-4">
              {step.keyPoints.map((point, index) => {
                const text = descs[point.id] || '';
                const described = text.trim().length >= MIN_DESC_LENGTH;
                const hints = hintLevel[point.id] || 0;
                return (
                  <div key={point.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-secondary-container text-secondary text-xs font-black flex items-center justify-center">{index + 1}</span>
                      <p className="text-sm font-bold">{point.label}</p>
                      <p className="text-xs text-muted-foreground">—— {point.hints[0]}</p>
                      <span className={`ml-auto text-xs font-bold ${described ? 'text-success' : 'text-muted-foreground'}`}>{described ? '已描述 ✓' : '未描述'}</span>
                      <button type="button" onClick={() => setHintLevel((value) => ({ ...value, [point.id]: Math.min(hints + 1, 3) }))}
                        disabled={hints >= 3}
                        className={`text-xs px-2 py-1 rounded-full border transition-colors ${hints >= 3 ? 'border-border text-muted-foreground cursor-not-allowed' : 'border-border text-muted-foreground hover:bg-muted cursor-pointer'}`}>
                        提示 {hints}/3
                      </button>
                    </div>
                    {hints > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground bg-muted/60 rounded-lg p-2.5">
                        {point.hints.slice(0, hints).map((hint) => <li key={hint} className="flex gap-1.5"><span className="text-primary font-black shrink-0">›</span>{hint}</li>)}
                      </ul>
                    )}
                    <textarea
                      value={text}
                      onChange={(event) => setDescs((value) => ({ ...value, [point.id]: event.target.value }))}
                      rows={2}
                      placeholder={`用自己的话描述：${point.label}（至少 ${MIN_DESC_LENGTH} 字）`}
                      className="mt-2 w-full rounded-lg bg-muted border-none px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/50 resize-y"
                    />
                  </div>
                );
              })}
            </div>
            {error && <p className="mt-3 text-xs font-bold text-destructive flex items-center gap-1.5"><CircleAlert className="w-3.5 h-3.5" />{error}</p>}
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary-container/35 p-4">
              <p className="text-sm font-extrabold">完成后直接提交</p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">无需再进入单独的“提交”页面。提交后，AI 会自动生成逐项点评、参考答案、本步五维学习报告和 Gate 结果。</p>
              <button type="button" onClick={submitEvaluation} disabled={busy || !descComplete || !isCurrent}
                className={`mt-3 w-full rounded-xl px-4 py-3 text-sm font-bold inline-flex items-center justify-center gap-2 ${busy || !descComplete || !isCurrent ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground shadow-card hover:opacity-90 cursor-pointer'}`}>
                {busy && <LoaderCircle className="w-4 h-4 spin" />}{busy ? 'AI 正在逐项评阅并生成报告…' : isCurrent ? '提交并生成本步学习报告' : '仅当前步骤可提交'}
              </button>
            </div>
          </section>
        )}

        {stage === 3 && evaluation && <section className="student-stage-panel student-stage-panel-review"><StepReviewReport step={step} evaluation={evaluation} answers={descs} syncNotice={syncNotice} onRevise={() => setStage(2)} onBack={onBack} /></section>}
          <footer className="workstation-footer mt-6 flex items-center justify-between gap-2">
            <button type="button" onClick={() => goTo(stage - 1)} disabled={stage === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-card border border-border text-xs font-semibold text-muted-foreground shadow-card disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:bg-muted transition-colors"><ArrowLeft className="w-4 h-4" /> 上一阶段</button>
            {stage === 2 ? <button type="button" aria-label="保存文字推演草稿" onClick={saveDraft} className="draft-save-button inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-secondary shadow-card"><Save className="w-4 h-4" /><span className="hidden sm:inline">保存草稿</span></button> : <p className="hidden sm:block text-xs font-semibold text-muted-foreground">阶段 {stage + 1} / {STAGE_LABELS.length} · {STAGE_LABELS[stage]}</p>}
            <button type="button" onClick={() => goTo(stage + 1)} disabled={stage >= STAGE_LABELS.length - 1 || !stageUnlocked(stage + 1)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-card disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">下一阶段 <ArrowRight className="w-4 h-4" /></button>
          </footer>
        </main>
      </div>
      {(stage === 0 || stage === 3) && <GlobalAiTutor sessionId={session.sessionId} step={step} mode={stage === 3 ? 'review' : 'task'} messages={session.messages} preview={preview} />}
    </div>
  );
}
