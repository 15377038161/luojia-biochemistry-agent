'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronUp, CircleAlert, CircleHelp, Flag, Lightbulb, LoaderCircle, PenLine, Save } from 'lucide-react';
import type { ApiResult, StudentSessionView, TextEvaluation } from '@/domain/agent';
import type { ExperimentStep } from '@/domain/agent';
import { experimentSteps } from '@/domain/experiment';
// 知识点检验改用 /api/student/quiz/* 接口（单页单题、提交后跳下一题、全部完成统一展示批改）
import PageBackground from '@/components/page-background';
import StudentTopbar from '@/components/student/student-topbar';
import GlobalAiTutor from '@/components/student/global-ai-tutor';
import StepReviewReport from '@/components/student/step-review-report';
import ExperimentProfileCard from '@/components/student/experiment-profile-card';
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

function previewQuizQuestions(step: ExperimentStep) {
  const labels = step.keyPoints.map((point) => point.label);
  return Array.from({ length: 5 }, (_, index) => ({
    question_id: `preview-${step.id}-${index + 1}`,
    question_text: index < labels.length ? `关于“${labels[index]}”，哪项说明同时包含原理、关键参数和判断依据？` : `完成步骤${step.id}时，哪项记录最有利于复现与排错？`,
    options: [
      { id: 'A', text: '说明因果原理，并记录关键参数、对照与结果判断' },
      { id: 'B', text: '只写操作名称，不记录条件和结果' },
      { id: 'C', text: '只描述看到的现象，不分析误差来源' },
      { id: 'D', text: '省略对照，直接给出结论' },
    ],
  }));
}

export default function StepWorkstation({ session, stepId, catalog = experimentSteps, preview = false, canSwitchToTeacher = false, onBack, onSessionUpdate, onOpenReport }: Props) {
  const step = catalog.find((item) => item.id === stepId) ?? experimentSteps[stepId - 1];
  const [stage, setStage] = useState(0);
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

  // 知识点检验会话状态（单页单题、提交后跳下一题、全部完成统一展示批改）
  const [quizSessionId, setQuizSessionId] = useState<string | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<Array<{ question_id: string; question_text: string; options: Array<{ id: string; text: string }> }>>([]);
  const [quizCurrentIndex, setQuizCurrentIndex] = useState(0);
  const [quizSelectedOption, setQuizSelectedOption] = useState<string>('');
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizResults, setQuizResults] = useState<Array<{ question_id: string; is_correct: boolean; user_answer: string; correct_answer: string; explanation: string }>>([]);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizReloadKey, setQuizReloadKey] = useState(0);
  const [showExecutionDetails, setShowExecutionDetails] = useState(true);

  // 初始化知识点检验会话
  useEffect(() => {
    if (stage !== 1 || quizSessionId) return;
    let cancelled = false;
    setError('');
    setQuizLoading(true);
    if (preview) {
      setQuizSessionId(`preview-${stepId}`);
      setQuizQuestions(previewQuizQuestions(step));
      setQuizCurrentIndex(0);
      setQuizSelectedOption('');
      setQuizAnswers({});
      setQuizResults([]);
      setQuizCompleted(false);
      setReviewIndex(0);
      setQuizLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/student/quiz/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stepNo: stepId }) });
        const data = await res.json();
        if (!cancelled && data.ok) {
          setQuizSessionId(data.data.session_id);
          setQuizQuestions(data.data.questions);
          setQuizCurrentIndex(0);
          setQuizSelectedOption('');
          setQuizAnswers({});
          setQuizResults([]);
          setQuizCompleted(false);
          setReviewIndex(0);
        } else if (!cancelled) {
          setError(data.error?.message || '加载题目失败');
        }
      } catch (err) {
        if (!cancelled) setError(clientErrorMessage(err, '加载题目失败'));
      } finally {
        if (!cancelled) setQuizLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [stage, stepId, step, quizSessionId, quizReloadKey, preview]);

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

  const quizOk = quizCompleted;
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
    if (index === 2) setRailHint('先完成「知识检验」作答，才能进入分步文字推演。');
    else setRailHint('先用自己的话完成全部子步骤描述并提交，AI 才会生成点评与本步报告。');
  }

  async function submitQuizAnswer() {
    if (!quizSelectedOption || !quizSessionId || quizQuestions.length === 0) return;
    const currentQuestion = quizQuestions[quizCurrentIndex];
    const newAnswers = { ...quizAnswers, [currentQuestion.question_id]: quizSelectedOption };
    setQuizAnswers(newAnswers);

    // 如果是最后一题，调用批量提交 API
    if (quizCurrentIndex + 1 >= quizQuestions.length) {
      setBusy(true);
      if (preview) {
        const results = quizQuestions.map((question) => ({
          question_id: question.question_id,
          is_correct: newAnswers[question.question_id] === 'A',
          user_answer: newAnswers[question.question_id],
          correct_answer: 'A',
          explanation: '完整答案需要同时说明底层原理、关键参数、对照设计和从数据到结论的推导过程。',
        }));
        setQuizResults(results);
        setQuizCompleted(true);
        setBusy(false);
        return;
      }
      try {
        const res = await fetch('/api/student/quiz/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: quizSessionId, answers: newAnswers }),
        });
        const data = await res.json();
        if (data.ok) {
          setQuizResults(data.data.results);
          setQuizCompleted(true);
        } else {
          setError(data.error?.message || '提交失败');
        }
      } catch (err) {
        setError(clientErrorMessage(err, '提交失败'));
      } finally {
        setBusy(false);
      }
    } else {
      // 跳下一题（不显示对错）
      setQuizCurrentIndex(quizCurrentIndex + 1);
      setQuizSelectedOption('');
    }
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
  const principlePoints = step.principle.split('。').map((part) => part.trim()).filter(Boolean).map((part) => `${part}。`);

  return (
    <div className="workstation-shell watercolor-student-task text-foreground font-sans">
      <PageBackground />
      <StudentTopbar title={`步骤 ${stepId} · ${step.shortTitle}`} subtitle={`阶段 ${stage + 1} / ${STAGE_LABELS.length} · ${STAGE_LABELS[stage]}`} onBack={onBack} backLabel="实验地图" onOpenReport={onOpenReport} showTeacherSwitch={canSwitchToTeacher} />
      <div className="workstation-layout mx-auto max-w-[1500px] px-4 sm:px-6 py-4 pb-8">
        <main className="student-stage-canvas min-w-0">
        <header className="workstation-step-heading flex flex-wrap items-center gap-3">
          <span className="shrink-0 w-9 h-9 rounded-full bg-secondary text-primary-foreground text-sm font-black flex items-center justify-center" aria-hidden>{STEP_BADGES[stepId - 1]}</span>
          <div className="step-heading-copy">
            <h1>{step.title}</h1>
            <p>{step.goal}</p>
          </div>
          <span className={`step-gate-state ${gatePassed ? 'is-passed' : 'is-pending'}`}><Flag aria-hidden />Gate {stepId} · {gatePassed ? '已通过' : '待通过'}</span>
        </header>

        <section className="workstation-card student-stage-navigation mt-4 rounded-2xl p-3">
          <div className="stage-strip flex flex-wrap gap-1.5">
            {STAGE_LABELS.map((label, index) => {
              const Icon = STAGE_ICONS[index];
              const unlocked = stageUnlocked(index);
              const active = stage === index;
              const past = unlocked && index < stage;
              return (
                <button key={label} type="button" onClick={() => goTo(index)}
                  disabled={!unlocked}
                  className={`inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary shadow-sm' : past ? 'bg-success-container text-success border-success/40' : unlocked ? 'bg-card text-foreground border-border hover:bg-muted cursor-pointer' : 'bg-muted text-muted-foreground border-border/60 cursor-not-allowed'}`}>
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${active ? 'bg-primary-foreground/20' : past ? 'bg-success/15' : 'bg-muted-foreground/15'}`}>{past ? '✓' : index + 1}</span>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="stage-label-desktop">{label}</span>
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
              <p className="mt-2 text-sm leading-relaxed">{step.context}</p>
              <p className="mt-2 text-sm leading-relaxed font-bold text-primary">本步目标：{step.goal}</p>
            </div>
            {stepId === 1 && <ExperimentProfileCard sessionId={session.sessionId} preview={preview} />}
            <div className="rounded-2xl bg-card/90 border border-secondary/30 shadow-card p-5 mt-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-extrabold flex items-center gap-2"><Lightbulb className="w-4 h-4 text-secondary" /> 原理讲解 · 这一步为什么这么做</h3>
                <span className="ml-auto shrink-0 text-xs font-bold text-secondary bg-secondary-container border border-secondary/30 rounded-full px-2.5 py-1">核心机制</span>
              </div>
              <div className="mt-3 grid gap-3">
                {principlePoints.map((point, index) => (
                  <div key={index} className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-secondary-container text-secondary text-xs font-black flex items-center justify-center">{index + 1}</span>
                    <p className="text-sm leading-relaxed text-foreground/90">{point}</p>
                  </div>
                ))}
              </div>
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
            <div className="execution-details-heading mt-5 flex items-center justify-between gap-3">
              <p className="text-xs font-black text-primary">实验执行要点 · 四项同步显示</p>
              <button type="button" onClick={() => setShowExecutionDetails((current) => !current)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary/20 bg-card px-3 text-xs font-bold text-primary">
                {showExecutionDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{showExecutionDetails ? '收起全部' : '展开全部'}
              </button>
            </div>
            {showExecutionDetails && <div className="execution-details-grid grid md:grid-cols-2 xl:grid-cols-4 gap-4 mt-3">
              {[
                { title: 'SOP 参数', items: step.sopParameters, tone: 'text-primary' },
                { title: '安全事项', items: step.safetyNotes, tone: 'text-warning' },
                { title: '判断与排错', items: step.decisionTree, tone: 'text-secondary' },
                { title: '设备与记录', items: [...step.instruments, step.scientificPractice], tone: 'text-success' },
              ].map((group) => (
                <article key={group.title} className="rounded-2xl bg-card/90 border border-border/60 shadow-card p-4">
                  <h3 className={`text-sm font-extrabold ${group.tone}`}>{group.title}</h3>
                  <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                    {group.items.map((item) => <li key={item} className="flex gap-2"><span>•</span><span>{item}</span></li>)}
                  </ul>
                </article>
              ))}
            </div>}
          </section>
        )}

        {stage === 1 && (
          <>
            <section className="mt-4 rounded-2xl bg-primary-container/40 border border-primary/20 p-5">
              <p className="text-xs font-black text-primary bg-card/80 border border-primary/30 rounded-full px-2.5 py-1 inline-flex items-center gap-1"><CircleHelp className="w-3 h-3" /> 引导级 · 知识检验</p>
              <h2 className="text-2xl font-bold tracking-tight mt-2">基础概念快问快答</h2>
              <p className="mt-2 text-sm leading-relaxed">用 5 道小题快速检验你对本步核心知识点、实验细节和数据判读的掌握情况。答错不影响解锁，答完即可查看每题解析，然后进入文字推演。</p>
            </section>

            {quizLoading && (
              <section className="mt-5 rounded-2xl bg-card/90 border border-border/60 shadow-card p-10 flex flex-col items-center justify-center">
                <LoaderCircle className="w-10 h-10 text-primary animate-spin" />
                <p className="mt-4 text-sm text-muted-foreground">正在为你抽取题目…</p>
              </section>
            )}

            {error && !quizLoading && (
              <section className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
                <p className="text-sm font-bold text-destructive flex items-center gap-2"><CircleAlert className="w-4 h-4" /> {error}</p>
                <button onClick={() => { setError(''); setQuizSessionId(null); setQuizReloadKey((current) => current + 1); }} className="mt-3 text-sm px-4 py-2 rounded-full bg-destructive text-destructive-foreground font-bold hover:opacity-90 transition-opacity">重新抽题</button>
              </section>
            )}

            {!quizLoading && !error && quizQuestions.length > 0 && !quizCompleted && (() => {
              const currentQ = quizQuestions[quizCurrentIndex];
              const progressPct = ((quizCurrentIndex + 1) / quizQuestions.length) * 100;
              const isLast = quizCurrentIndex + 1 >= quizQuestions.length;
              return (
                <section className="mt-5 pb-28">
                  <div className="mx-auto max-w-2xl">
                    {/* 题号导航条 */}
                    <div className="flex items-center justify-center gap-2 mb-5 flex-wrap">
                      {quizQuestions.map((q, idx) => {
                        const isCurrent = idx === quizCurrentIndex;
                        const isAnswered = Boolean(quizAnswers[q.question_id]) || (isCurrent && Boolean(quizSelectedOption));
                        return (
                          <span key={idx} className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-black transition-colors ${isCurrent ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30' : isAnswered ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                            {idx + 1}
                          </span>
                        );
                      })}
                    </div>

                    {/* 题干卡片 */}
                    <div className="rounded-2xl bg-card border border-border shadow-card overflow-hidden">
                      <div className="bg-gradient-to-r from-primary/8 to-secondary/5 px-6 py-4 border-b border-border flex items-center gap-3">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-primary-foreground text-base font-black shrink-0">
                          {quizCurrentIndex + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">单选题</p>
                          <p className="text-[11px] text-muted-foreground">请选择一个正确答案</p>
                        </div>
                        <span className="text-xs font-bold text-muted-foreground">{quizCurrentIndex + 1} / {quizQuestions.length}</span>
                      </div>

                      <div className="p-6">
                        <p className="text-base font-bold leading-7 text-foreground">{currentQ.question_text}</p>

                        <div className="mt-5 space-y-3">
                          {currentQ.options.map((option) => {
                            const isSelected = quizSelectedOption === option.id;
                            const optionLetterBg = isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border';
                            return (
                              <button key={option.id} type="button" onClick={() => setQuizSelectedOption(option.id)}
                                className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-all flex items-start gap-3.5 group ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'}`}>
                                <span className={`shrink-0 mt-0.5 w-8 h-8 rounded-lg border-2 flex items-center justify-center text-sm font-black transition-colors ${optionLetterBg}`}>
                                  {option.id}
                                </span>
                                <span className={`text-sm leading-6 pt-0.5 ${isSelected ? 'text-foreground font-bold' : 'text-foreground/90'}`}>{option.text}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* 操作按钮区 */}
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <button onClick={() => {
                        if (quizCurrentIndex > 0) {
                          const updatedAnswers = quizSelectedOption ? { ...quizAnswers, [currentQ.question_id]: quizSelectedOption } : quizAnswers;
                          setQuizAnswers(updatedAnswers);
                          const prevQ = quizQuestions[quizCurrentIndex - 1];
                          setQuizCurrentIndex(quizCurrentIndex - 1);
                          setQuizSelectedOption(updatedAnswers[prevQ.question_id] || '');
                        }
                      }}
                        disabled={quizCurrentIndex === 0 || busy}
                        className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-card border border-border text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        <ArrowLeft className="w-4 h-4" /> 上一题
                      </button>
                      <button onClick={submitQuizAnswer} disabled={!quizSelectedOption || busy}
                        className="flex-1 ml-2 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-black shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:opacity-95 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all">
                        {busy ? (
                          <><LoaderCircle className="w-4 h-4 animate-spin" /> 提交中…</>
                        ) : isLast ? (
                          <>提交答卷 <Check className="w-4 h-4" /></>
                        ) : (
                          <>下一题 <ArrowRight className="w-4 h-4" /></>
                        )}
                      </button>
                    </div>
                  </div>
                </section>
              );
            })()}

            {quizCompleted && (() => {
              const correctCount = quizResults.filter((r) => r.is_correct).length;
              const pct = Math.round((correctCount / quizResults.length) * 100);
              const onReviewLast = reviewIndex >= quizResults.length - 1;
              const onReviewFirst = reviewIndex <= 0;
              const result = quizResults[reviewIndex];
              const q = quizQuestions.find((x) => x.question_id === result?.question_id);
              if (!result || !q) return null;
              const userOpt = q.options.find((o) => o.id === result.user_answer);
              const correctOpt = q.options.find((o) => o.id === result.correct_answer);
              return (
                <section className="mt-5 pb-28">
                  <div className="mx-auto max-w-2xl">
                    {/* 成绩总结条 */}
                    <div className="mb-5 rounded-2xl bg-card border border-border shadow-card p-4 flex items-center gap-4">
                      <div className={`shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${result.is_correct || pct >= 60 ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                        <span className={`text-xl font-black ${pct >= 80 ? 'text-success' : pct >= 60 ? 'text-secondary' : 'text-destructive'}`}>{pct}<span className="text-xs">分</span></span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black">答题结果</p>
                        <p className="text-xs text-muted-foreground mt-0.5">答对 {correctCount} / {quizResults.length} 题 · 答题解析</p>
                      </div>
                      <button onClick={() => setStage(2)} className="shrink-0 inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-black hover:opacity-90 transition-opacity">
                        继续 <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* 题号导航 */}
                    <div className="flex items-center justify-center gap-2 mb-5 flex-wrap">
                      {quizResults.map((r, idx) => {
                        const isCurrent = idx === reviewIndex;
                        return (
                          <button key={r.question_id} onClick={() => setReviewIndex(idx)}
                            className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-xs font-black transition-all ${isCurrent ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''} ${r.is_correct ? 'bg-success/15 text-success hover:bg-success/25' : 'bg-destructive/15 text-destructive hover:bg-destructive/25'}`}>
                            {r.is_correct ? <Check className="w-4 h-4" /> : <span>{idx + 1}</span>}
                          </button>
                        );
                      })}
                    </div>

                    {/* 题目卡片 */}
                    <div className="rounded-2xl bg-card border border-border shadow-card overflow-hidden">
                      <div className={`px-6 py-4 border-b border-border flex items-center gap-3 ${result.is_correct ? 'bg-success/5' : 'bg-destructive/5'}`}>
                        <span className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-black ${result.is_correct ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'}`}>
                          {result.is_correct ? <Check className="w-3.5 h-3.5" /> : <CircleAlert className="w-3.5 h-3.5" />}
                          {result.is_correct ? '回答正确' : '回答错误'}
                        </span>
                        <span className="text-sm font-black">第 {reviewIndex + 1} 题 / 共 {quizResults.length} 题</span>
                        <span className="ml-auto text-[11px] font-bold text-muted-foreground">单选题</span>
                      </div>

                      <div className="p-6">
                        <p className="text-base font-bold leading-7">{q.question_text}</p>

                        <div className="mt-5 space-y-2.5">
                          {q.options.map((option) => {
                            const isUser = option.id === result.user_answer;
                            const isCorrect = option.id === result.correct_answer;
                            let optStyle = 'border-border bg-card';
                            let letterStyle = 'bg-muted text-muted-foreground border-muted';
                            let tailIcon = null;
                            if (isCorrect) {
                              optStyle = 'border-success bg-success/5';
                              letterStyle = 'bg-success text-success-foreground border-success';
                              tailIcon = <Check className="w-5 h-5 text-success shrink-0" />;
                            } else if (isUser && !isCorrect) {
                              optStyle = 'border-destructive bg-destructive/5';
                              letterStyle = 'bg-destructive text-destructive-foreground border-destructive';
                              tailIcon = <span className="shrink-0 text-destructive text-lg font-black leading-none">✗</span>;
                            }
                            return (
                              <div key={option.id} className={`rounded-xl border-2 px-4 py-3.5 flex items-start gap-3 ${optStyle}`}>
                                <span className={`shrink-0 mt-0.5 w-8 h-8 rounded-lg border-2 flex items-center justify-center text-sm font-black ${letterStyle}`}>{option.id}</span>
                                <span className="text-sm leading-6 flex-1 pt-0.5">{option.text}</span>
                                {tailIcon && <span className="mt-1">{tailIcon}</span>}
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-5 rounded-xl bg-primary-container/30 border border-primary/15 p-4">
                          <p className="text-xs font-black text-primary flex items-center gap-1.5"><Lightbulb className="w-4 h-4" /> 题目解析</p>
                          <p className="mt-2 text-sm leading-7 text-foreground/85">{result.explanation}</p>
                        </div>

                        {!result.is_correct && (
                          <div className="mt-3 rounded-xl bg-destructive/5 border border-destructive/20 p-4">
                            <p className="text-xs font-black text-destructive flex items-center gap-1.5"><CircleAlert className="w-4 h-4" /> 易错提醒</p>
                            <p className="mt-1.5 text-sm leading-7 text-foreground/85">你选择了 <b className="text-destructive">{result.user_answer}. {userOpt?.text}</b>，正确答案应为 <b className="text-success">{result.correct_answer}. {correctOpt?.text}</b>。{result.explanation.split('。')[0]}。</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 上下题切换 */}
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <button onClick={() => setReviewIndex(reviewIndex - 1)} disabled={onReviewFirst}
                        className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-card border border-border text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        <ArrowLeft className="w-4 h-4" /> 上一题
                      </button>
                      <span className="text-xs text-muted-foreground font-bold">{reviewIndex + 1} / {quizResults.length}</span>
                      {onReviewLast ? (
                        <button onClick={() => setStage(2)}
                          className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-black shadow-lg shadow-primary/25 hover:opacity-95 transition-opacity">
                          进入分步推演 <ArrowRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <button onClick={() => setReviewIndex(reviewIndex + 1)}
                          className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-black shadow-lg shadow-primary/25 hover:opacity-95 transition-opacity">
                          下一题 <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              );
            })()}
          </>
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

            <div className="mt-6 flex flex-col items-center">
              <button type="button" onClick={submitEvaluation} disabled={busy || !descComplete || !isCurrent}
                className={`w-full max-w-xl rounded-xl px-5 py-4 text-base font-black inline-flex items-center justify-center gap-2 shadow-lg transition-all ${busy || !descComplete || !isCurrent ? 'bg-muted text-muted-foreground cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-secondary to-primary text-primary-foreground shadow-secondary/30 hover:shadow-xl hover:-translate-y-0.5 cursor-pointer'}`}>
                {busy && <LoaderCircle className="w-5 h-5 animate-spin" />}
                {busy ? 'AI 正在逐项评阅并生成报告…' : !isCurrent ? '仅当前步骤可提交' : !descComplete ? `请完成全部 ${step.keyPoints.length} 步描述后提交（${describedCount}/${step.keyPoints.length}）` : '提交作答，让 AI 生成点评报告 →'}
              </button>
              <p className="mt-2 text-[11px] text-muted-foreground">提交后 AI 会给出逐项点评、参考答案、本步五维学习报告与 Gate 结果。</p>
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
