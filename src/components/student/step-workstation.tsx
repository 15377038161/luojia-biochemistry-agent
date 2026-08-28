'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, Check, CircleAlert, CircleHelp, Flag, LoaderCircle, PenLine, Save, Send } from 'lucide-react';
import type { AgentMessage, ApiResult, DimensionScores, StudentSessionView, TextEvaluation } from '@/domain/agent';
import type { ExperimentStep } from '@/domain/agent';
import { experimentSteps } from '@/domain/experiment';
import { getStepQuiz } from '@/domain/quiz';
import PageBackground from '@/components/page-background';
import StudentTopbar from '@/components/student/student-topbar';
import { dispatchChaoxingTaskflow } from '@/lib/chaoxing-taskflow-client';
import type { ChaoxingTaskflowPayload } from '@/lib/chaoxing-taskflow-contract';

const STAGE_LABELS = ['任务与原理', '知识检验', '分步文字推演', '提交与点评', 'Gate 检查点'];
const STAGE_MOBILE_LABELS = ['任务', '检验', '推演', '点评', 'Gate'];
const STAGE_ICONS = [BookOpen, CircleHelp, PenLine, BarChart3, Flag];
const STEP_BADGES = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
const DIMENSION_META: Array<{ key: keyof DimensionScores; label: string; max: number }> = [
  { key: 'knowledge', label: '知识理解', max: 20 },
  { key: 'operation', label: '操作描述', max: 30 },
  { key: 'decision', label: '科学决策', max: 20 },
  { key: 'troubleshooting', label: '问题解决', max: 15 },
  { key: 'analysis', label: '结果分析', max: 15 },
];
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
  };
}

type DiagnosticKind = '需要补充' | '需要修正' | '表达待澄清';

function buildDiagnostics(evaluation: TextEvaluation, submittedAnswer: string) {
  if (evaluation.detailedIssues.length > 0) {
    return evaluation.detailedIssues.slice(0, 4).map((issue) => ({
      rubricId: `${issue.dimension}-${issue.title}`,
      label: issue.title,
      kind: issue.kind === 'incorrect' || issue.kind === 'safety' ? '需要修正' as const : issue.kind === 'ambiguous' ? '表达待澄清' as const : '需要补充' as const,
      scene: issue.evidence.quote ? `${issue.scenario} 证据：“${issue.evidence.quote}”` : issue.scenario,
      guidance: issue.action,
      impact: issue.impact,
      causeBoundary: issue.causeBoundary,
      check: issue.check,
    }));
  }
  const evidence = evaluation.coveredPoints.find((point) => point.quote.trim())?.quote.trim();
  const fallbackScene = submittedAnswer.trim().replace(/\s+/g, ' ').slice(0, 72);
  const source = [
    ...evaluation.incorrectPoints.map((point) => ({ kind: '需要修正' as const, point })),
    ...evaluation.ambiguousPhrases.map((point) => ({ kind: '表达待澄清' as const, point })),
    ...evaluation.missingPoints.map((point) => ({ kind: '需要补充' as const, point })),
  ].slice(0, 3);
  return source.map(({ kind, point }) => ({
    ...point,
    kind: kind as DiagnosticKind,
    scene: evidence ? `你在本次描述中写到：“${evidence}”` : fallbackScene ? `本次提交围绕“${fallbackScene}${submittedAnswer.length > 72 ? '…' : ''}”展开，但未交代该要点。` : '本次提交中未提供可引用的文字证据。',
    impact: '该信息缺失会让本步判断依据无法被复核。',
    causeBoundary: '只能确认本次文字描述存在信息缺口，不推断学习态度或习惯。',
    check: `修订后应能直接定位到“${point.label}”对应的条件、理由与后续影响。`,
  }));
}

export default function StepWorkstation({ session, stepId, catalog = experimentSteps, preview = false, onBack, onSessionUpdate, onOpenReport }: Props) {
  const step = catalog.find((item) => item.id === stepId) ?? experimentSteps[stepId - 1];
  const quiz = getStepQuiz(stepId);
  const [stage, setStage] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [descs, setDescs] = useState<Record<string, string>>({});
  const [hintLevel, setHintLevel] = useState<Record<string, number>>({});
  const [helpFor, setHelpFor] = useState<string | null>(null);
  const [helpText, setHelpText] = useState('');
  const [helpReplies, setHelpReplies] = useState<Record<string, string>>({});
  const [helpBusy, setHelpBusy] = useState(false);
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
    if (index === 4) return quizOk && descComplete && evaluation !== null;
    return quizOk && descComplete;
  }

  function goTo(index: number) {
    if (stageUnlocked(index)) { setStage(index); setRailHint(''); return; }
    if (index === 2) setRailHint('先在「知识检验」答对全部题目，才能进入分步文字推演。');
    else setRailHint('先用自己的话完成全部子步骤描述，才能提交点评与 Gate 检查。');
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

  async function sendHelp(pointId: string, label: string) {
    const content = helpText.trim();
    if (content.length < 2 || helpBusy) return;
    setHelpBusy(true); setError('');
    if (preview) {
      const hint = step.keyPoints.find((point) => point.id === pointId)?.hints[1] || '先回顾本步目标再描述。';
      setHelpReplies((value) => ({ ...value, [pointId]: `提示：${hint}` }));
      setHelpText(''); setHelpBusy(false); return;
    }
    try {
      const created = await api<AgentMessage[]>('/api/student/messages', { sessionId: session.sessionId, content: `【求助·${label}】${content}` });
      const reply = [...created].reverse().find((message) => message.role === 'assistant');
      if (reply) setHelpReplies((value) => ({ ...value, [pointId]: reply.content }));
      setHelpText('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '求助发送失败'); }
    finally { setHelpBusy(false); }
  }

  async function submitEvaluation() {
    if (!descComplete || busy || !isCurrent) return;
    setBusy(true); setError(''); setSyncNotice('');
    const answer = submittedAnswer;
    if (preview) {
      setEvaluation(previewEvaluation(step)); setBusy(false); setStage(4); return;
    }
    try {
      const requestKey = crypto.randomUUID();
      const result = await api<{ evaluation: TextEvaluation; session: StudentSessionView; chaoxingTaskflow?: ChaoxingTaskflowPayload }>('/api/student/evaluate', { sessionId: session.sessionId, answer, requestId: requestKey });
      const lastIndex = result.session.messages.length - 1;
      if (lastIndex >= 0) result.session.messages[lastIndex] = { ...result.session.messages[lastIndex], evaluation: result.evaluation };
      setEvaluation(result.evaluation);
      onSessionUpdate(result.session);
      setStage(4);
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : '评阅失败，请稍后重试'); }
    finally { setBusy(false); }
  }

  const gatePassed = evaluation?.decision === 'pass';
  const totalScore = evaluation ? DIMENSION_META.reduce((sum, meta) => sum + evaluation.scores[meta.key], 0) : 0;

  return (
    <div className="workstation-shell watercolor-student-task text-foreground font-sans">
      <PageBackground />
      <StudentTopbar title={`步骤 ${stepId} · ${step.shortTitle}`} subtitle={`阶段 ${stage + 1} / ${STAGE_LABELS.length} · ${STAGE_LABELS[stage]}`} onBack={onBack} backLabel="实验地图" onOpenReport={onOpenReport} />
      <div className="workstation-layout mx-auto max-w-[1260px] px-4 sm:px-6 py-5 pb-16 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <main className="min-w-0 max-w-4xl">
        <header className="workstation-step-heading flex flex-wrap items-center gap-3">
          <div className="step-heading-copy"><p>当前学习任务</p><h1>{step.goal}</h1></div>
          <span className={`step-gate-state ${gatePassed ? 'is-passed' : 'is-pending'}`}><Flag aria-hidden />Gate {stepId} · {gatePassed ? '已通过' : '待通过'}</span>
        </header>

        <section className="workstation-card mt-4 rounded-2xl p-3">
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
          <section className="mt-4">
            <div className="rounded-2xl bg-primary-container/40 border border-primary/20 p-5">
              <p className="text-xs font-black text-primary bg-card/80 border border-primary/30 rounded-full px-2.5 py-1 inline-flex items-center gap-1"><BookOpen className="w-3 h-3" /> 引导级 · 任务情境</p>
              <h2 className="text-2xl font-bold tracking-tight mt-2">你在哪里？要回答什么问题？</h2>
              <p className="mt-2 text-sm leading-relaxed">{step.context}本步目标：{step.goal}</p>
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
          <section className="mt-4 rounded-2xl bg-card/90 border border-border/60 shadow-card p-6">
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
          <section className="mt-4 rounded-2xl bg-card/90 border border-border/60 shadow-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-black text-primary-foreground bg-secondary border border-secondary/40 rounded-full px-2.5 py-1 inline-flex items-center gap-1"><PenLine className="w-3 h-3" /> 推演级 · 分步描述</p>
              <div className="ml-auto flex items-center gap-2 text-xs font-bold">
                <span className="px-2.5 py-1 rounded-full bg-primary-container text-primary">已描述 {describedCount} / {step.keyPoints.length} 步</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5"><CircleHelp className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />假设你正在设计本步方案，用自己的话逐条写清顺序、参数、安全要点和结果判断；卡住可点「提示」或「求助」。</p>
            <div className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${(describedCount / step.keyPoints.length) * 100}%` }} /></div>
            <p className="mt-2 text-right text-[11px] font-bold text-muted-foreground">{draftNotice}</p>
            {preview && (
              <div className="mt-3 flex justify-end">
                <button type="button"
                  onClick={() => setDescs(Object.fromEntries(step.keyPoints.map((point) => [point.id, `示例描述：${point.label}。${point.hints[0]}${point.hints[1] ? `补充：${point.hints[1]}` : ''}`])))}
                  className="text-xs px-3 py-1.5 rounded-full border border-primary/40 text-primary bg-primary-container hover:opacity-80 transition-opacity cursor-pointer">一键填入演示描述（仅预览）</button>
              </div>
            )}
            <div className="mt-4 space-y-3">
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
                      <button type="button" onClick={() => { setHelpFor(helpFor === point.id ? null : point.id); setHelpText(''); }}
                        className="text-xs px-2 py-1 rounded-full border border-primary/40 text-primary hover:bg-primary-container transition-colors cursor-pointer">求助</button>
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
                    {helpFor === point.id && (
                      <div className="mt-2 rounded-lg bg-primary-container/40 border border-primary/20 p-3">
                        {helpReplies[point.id] && <p className="text-xs leading-relaxed bg-card rounded-lg border border-border px-3 py-2 mb-2"><b className="text-primary">智能体：</b>{helpReplies[point.id]}</p>}
                        <div className="flex gap-2">
                          <input value={helpText} onChange={(event) => setHelpText(event.target.value)}
                          onKeyDown={(event) => { if (event.key === 'Enter') void sendHelp(point.id, point.label); }}
                            placeholder="针对这一条，你想问什么？"
                            className="flex-1 rounded-lg bg-card border border-border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50" />
                          <button type="button" onClick={() => sendHelp(point.id, point.label)} disabled={helpBusy || helpText.trim().length < 2}
                            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 cursor-pointer inline-flex items-center gap-1">
                            {helpBusy ? <LoaderCircle className="w-3.5 h-3.5 spin" /> : <Send className="w-3.5 h-3.5" />}发送
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {error && <p className="mt-3 text-xs font-bold text-destructive flex items-center gap-1.5"><CircleAlert className="w-3.5 h-3.5" />{error}</p>}
          </section>
        )}

        {stage === 3 && (
          <section className="mt-4 rounded-2xl bg-card/90 border border-border/60 shadow-card p-6">
            <p className="text-xs font-black text-primary bg-primary-container/60 border border-primary/30 rounded-full px-2.5 py-1 inline-flex items-center gap-1"><BarChart3 className="w-3 h-3" /> 评估级 · 提交点评</p>
            <h2 className="text-lg font-bold mt-2">提交本步完整描述，获得智能体点评</h2>
            <p className="mt-1 text-xs text-muted-foreground">你的 {step.keyPoints.length} 条文字推演将合并提交，智能体对照课程资料逐条核对，并按五维模型评分（本次提交计入正式次数）。</p>
            <div className="mt-4 rounded-xl bg-muted/60 border border-border p-4 max-h-56 overflow-y-auto space-y-2">
              {step.keyPoints.map((point) => (
                <p key={point.id} className="text-xs leading-relaxed"><b className="text-primary">【{point.label}】</b>{(descs[point.id] || '').trim()}</p>
              ))}
            </div>
            {error && <p className="mt-3 text-xs font-bold text-destructive flex items-center gap-1.5"><CircleAlert className="w-3.5 h-3.5" />{error}</p>}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => setStage(2)} className="px-4 py-2 rounded-xl border border-border bg-card text-sm font-bold hover:bg-muted transition-colors cursor-pointer">返回修改</button>
              <button type="button" onClick={submitEvaluation} disabled={busy || !descComplete || !isCurrent}
                className={`px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-2 cursor-pointer ${busy || !descComplete || !isCurrent ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground shadow-card hover:opacity-90'}`}>
                {busy && <LoaderCircle className="w-4 h-4 spin" />}{busy ? '智能体正在评阅…' : isCurrent ? '提交并请求点评' : '仅当前步骤可提交'}
              </button>
            </div>
            {evaluation && (
              <div className={`mt-5 rounded-xl border p-4 ${gatePassed ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10'}`}>
                <p className="text-sm font-extrabold flex items-center gap-2">
                  {gatePassed ? <Check className="w-4 h-4 text-success" /> : <CircleAlert className="w-4 h-4 text-warning" />}
                  {gatePassed ? '本步达标' : '还需补充'} · 五维得分 {totalScore}/100
                </p>
                <p className="mt-2 text-xs leading-relaxed">{evaluation.studentFeedback}</p>
                <div className="mt-3 grid sm:grid-cols-5 gap-2">
                  {DIMENSION_META.map((meta) => {
                    const score = evaluation.scores[meta.key];
                    return (
                      <div key={meta.key} className="rounded-lg bg-card border border-border p-2.5 text-xs">
                        <p className="font-bold">{meta.label}</p>
                        <p className="mt-1 font-black text-primary">{score}<span className="text-muted-foreground font-normal">/{meta.max}</span></p>
                        <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${(score / meta.max) * 100}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
                {evaluation.coveredPoints.length > 0 && (
                  <div className="mt-3"><p className="text-xs font-black text-success">已经讲清楚</p><ul className="mt-1 space-y-1">{evaluation.coveredPoints.map((point) => <li key={point.rubricId} className="text-xs flex gap-1.5"><Check className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />{point.label}</li>)}</ul></div>
                )}
                {evaluation.missingPoints.length > 0 && (
                  <div className="mt-3"><p className="text-xs font-black text-warning">建议补充</p><ul className="mt-1 space-y-1">{evaluation.missingPoints.map((point) => <li key={point.rubricId} className="text-xs flex gap-1.5"><CircleAlert className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />{point.label}：{point.guidance}</li>)}</ul></div>
                )}
                {buildDiagnostics(evaluation, submittedAnswer).length > 0 && (
                  <div className="mt-4 border-t border-border/70 pt-4">
                    <p className="text-xs font-black text-primary">逐项学习诊断（基于本次提交）</p>
                    <div className="mt-2 space-y-2">
                      {buildDiagnostics(evaluation, submittedAnswer).map((item) => (
                        <article key={`${item.kind}-${item.rubricId}`} className="rounded-lg border border-border bg-card/75 p-3 text-xs leading-6">
                          <p className="font-bold text-foreground">{item.kind} · {item.label}</p>
                          <p className="mt-1 text-muted-foreground"><b>学习场景：</b>{item.scene}</p>
                          <p className="mt-1 text-muted-foreground"><b>问题影响：</b>{item.impact}</p>
                          <p className="mt-1 text-muted-foreground"><b>成因边界：</b>{item.causeBoundary}</p>
                          <p className="mt-1 text-primary"><b>修订动作：</b>{item.guidance}</p>
                          <p className="mt-1 text-secondary"><b>检查标准：</b>{item.check}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
                {evaluation.safetyAlerts.length > 0 && (
                  <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3"><p className="text-xs font-black text-destructive">必须修正</p>{evaluation.safetyAlerts.map((point) => <p key={point.rubricId} className="mt-1 text-xs">{point.guidance}</p>)}</div>
                )}
                {evaluation.questions.length > 0 && <p className="mt-3 text-xs font-bold text-primary flex items-center gap-1.5"><CircleHelp className="w-3.5 h-3.5" />{evaluation.questions[0]}</p>}
              </div>
            )}
          </section>
        )}

        {stage === 4 && (
          <section className="mt-4 rounded-2xl bg-card/90 border border-border/60 shadow-card p-6">
            <h2 className="text-lg font-bold flex items-center gap-2"><Flag className="w-5 h-5 text-primary" /> Gate {stepId} · {step.shortTitle}检查点</h2>
            <p className="mt-1 text-xs text-muted-foreground">验证内容（教学大纲）：{step.goal}{stepId < 8 ? `通过后才能进入步骤${STEP_BADGES[stepId]}。` : '这是最后一步，通过后完成全部文字推演。'}</p>
            {syncNotice && <p className="mt-3 text-xs font-bold text-primary flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />{syncNotice}</p>}
            <div className="mt-4 grid md:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-muted/60 p-3"><p className="font-bold">描述完整性</p><p className={`mt-1 font-bold ${descComplete ? 'text-success' : 'text-warning'}`}>{describedCount}/{step.keyPoints.length} 子步骤已描述 {descComplete ? '✓' : ''}</p></div>
              <div className="rounded-xl bg-muted/60 p-3"><p className="font-bold">结果分析与判断</p><p className={`mt-1 font-bold ${!evaluation ? 'text-muted-foreground' : gatePassed ? 'text-success' : 'text-warning'}`}>{!evaluation ? '尚未提交评阅' : gatePassed ? `${totalScore}/100 达标 ✓` : `${totalScore}/100 待修订`}</p></div>
              <div className="rounded-xl bg-muted/60 p-3"><p className="font-bold">安全与记录</p><p className={`mt-1 font-bold ${!evaluation ? 'text-muted-foreground' : evaluation.safetyAlerts.length > 0 ? 'text-warning' : 'text-success'}`}>{!evaluation ? '尚未提交评阅' : evaluation.safetyAlerts.length > 0 ? `${evaluation.safetyAlerts.length} 项待修正` : '无安全修正项 ✓'}</p></div>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-black flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-primary" /> 五维评价模型（本步记录计入总评）</p>
              <div className="mt-2 grid sm:grid-cols-5 gap-2 text-xs">
                {DIMENSION_META.map((meta) => (
                  <div key={meta.key} className="rounded-lg bg-muted/60 p-2.5"><p className="font-bold">{meta.label}</p><p className="mt-0.5 text-muted-foreground">权重 {meta.max} 分</p></div>
                ))}
              </div>
            </div>
            <div className={`mt-4 rounded-xl border p-5 text-center ${gatePassed ? 'border-success/50 bg-success/10' : 'border-warning/50 bg-warning/10'}`}>
              <p className={`text-xl font-black tracking-widest ${gatePassed ? 'text-success' : 'text-warning'}`}>{gatePassed ? '✓ GATE 通过' : '⚠ GATE 待通过'}</p>
              <p className="mt-2 text-xs text-muted-foreground">{gatePassed ? '本步达标，地图上的下一站点已解锁。' : '根据上方点评修订描述后重新提交，即可通过本 Gate。'}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {gatePassed ? (
                  <button type="button" onClick={onBack} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-card hover:opacity-90 transition-opacity cursor-pointer">返回实验地图，进入下一站</button>
                ) : (
                  <button type="button" onClick={() => setStage(2)} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-card hover:opacity-90 transition-opacity cursor-pointer">返回修改描述</button>
                )}
              </div>
            </div>
          </section>
        )}
          <footer className="workstation-footer mt-6 flex items-center justify-between gap-2">
            <button type="button" onClick={() => goTo(stage - 1)} disabled={stage === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-card border border-border text-xs font-semibold text-muted-foreground shadow-card disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:bg-muted transition-colors"><ArrowLeft className="w-4 h-4" /> 上一阶段</button>
            {stage === 2 ? <button type="button" aria-label="保存文字推演草稿" onClick={saveDraft} className="draft-save-button inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-secondary shadow-card"><Save className="w-4 h-4" /><span className="hidden sm:inline">保存草稿</span></button> : <p className="hidden sm:block text-xs font-semibold text-muted-foreground">阶段 {stage + 1} / {STAGE_LABELS.length} · {STAGE_LABELS[stage]}</p>}
            <button type="button" onClick={() => goTo(stage + 1)} disabled={stage >= STAGE_LABELS.length - 1 || !stageUnlocked(stage + 1)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-card disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">下一阶段 <ArrowRight className="w-4 h-4" /></button>
          </footer>
        </main>
        <aside className="workstation-feedback-rail hidden lg:block sticky top-6">
          <div className="rounded-3xl bg-card border border-border shadow-card p-5">
            <p className="text-xs font-black text-primary tracking-[.12em]">AI FEEDBACK</p>
            <h2 className="mt-2 text-lg font-extrabold">本步点评与修订</h2>
            {!evaluation ? (
              <div className="mt-4 rounded-2xl bg-primary-container/60 border border-primary/20 p-4">
                <p className="text-sm font-bold">先完成文字方案</p>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">提交后，AI 会对照课程材料指出遗漏、表达模糊和必须修正项。</p>
              </div>
            ) : (
              <>
                <div className={`mt-4 rounded-2xl border p-4 ${gatePassed ? 'border-success/30 bg-success/10' : 'border-warning/30 bg-warning/10'}`}>
                  <p className={`text-sm font-extrabold ${gatePassed ? 'text-success' : 'text-warning'}`}>{gatePassed ? 'Gate 已通过' : `${evaluation.missingPoints.length} 项建议补充`}</p>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{evaluation.studentFeedback}</p>
                </div>
                {evaluation.missingPoints.slice(0, 3).map((point) => (
                  <div key={point.rubricId} className="mt-3 rounded-2xl bg-[#fff2ea] border border-[#f6c5a9] p-4">
                    <p className="text-xs font-extrabold text-warning">{point.label}</p>
                    <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{point.guidance}</p>
                  </div>
                ))}
                {evaluation.coveredPoints.length > 0 && <p className="mt-4 text-xs font-bold text-success flex items-center gap-1.5"><Check className="w-4 h-4" /> 已讲清楚 {evaluation.coveredPoints.length} 项</p>}
              </>
            )}
            <div className="mt-5 pt-4 border-t border-border text-xs leading-6 text-muted-foreground">修改后再次提交，直到本步 Gate 通过。AI 反馈只用于学习修订，不生成真实实验结果。</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
