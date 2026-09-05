"use client";
import { useEffect, useRef, useState } from "react";

import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CircleAlert,
    CircleHelp,
    Flag,
    PenLine,
    Save,
} from "lucide-react";

import type { ApiResult, StudentSessionView, TextEvaluation } from "@/domain/agent";
import type { ExperimentStep } from "@/domain/agent";
import { experimentSteps } from "@/domain/experiment";
import PageBackground from "@/components/page-background";
import StudentTopbar from "@/components/student/student-topbar";
import GlobalAiTutor from "@/components/student/global-ai-tutor";
import StepReviewReport from "@/components/student/step-review-report";
import TaskPrinciples from "@/components/student/task-principles";
import QuizPanel from "@/components/student/quiz-panel";
import ExperimentWriter from "@/components/student/experiment-writer";
import { dispatchChaoxingTaskflow } from "@/lib/chaoxing-taskflow-client";
import type { ChaoxingTaskflowPayload } from "@/lib/chaoxing-taskflow-contract";
import { clientErrorMessage } from "@/lib/client-request";
const STAGE_LABELS = ["任务与原理", "知识检验", "分步文字推演", "AI 点评与本步报告"];
const STAGE_MOBILE_LABELS = ["任务", "检验", "推演", "报告"];
const STAGE_ICONS = [BookOpen, CircleHelp, PenLine, Flag];
const STEP_BADGES = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
// 用户填写门槛：去掉字数门槛，只要"用自己话说了一句"（trim 后非空）即视为已作答
const MIN_DESC_LENGTH = 1;

async function api<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify(body)
    });

    const payload = await response.json() as ApiResult<T>;

    if (!payload.ok)
        throw new Error(payload.error.message);

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
        schemaVersion: "TextEvaluation.v2",
        decision: "pass",
        confidence: 0.9,

        coveredPoints: step.keyPoints.slice(0, 3).map(point => ({
            rubricId: point.id,
            label: point.label,
            quote: ""
        })),

        missingPoints: step.keyPoints.slice(3, 4).map(point => ({
            rubricId: point.id,
            label: point.label,
            guidance: point.hints[2]
        })),

        incorrectPoints: [],
        ambiguousPhrases: [],
        safetyAlerts: [],
        questions: [step.keyPoints[4]?.hints[0] || "回顾本步结论如何影响下一步。"],
        studentFeedback: "这是功能预览：正式环境会调用大模型对照课程资料逐条评阅，并把结果计入五维总评。",
        teacherSummary: "",

        scores: {
            knowledge: 18,
            operation: 26,
            decision: 17,
            troubleshooting: 12,
            analysis: 12
        },

        requiresTeacherReview: false,
        knowledgeChunkIds: [],

        detailedIssues: step.keyPoints.slice(3, 4).map(point => ({
            dimension: point.dimension,
            kind: "missing",
            title: point.label,

            evidence: {
                stepId: step.id,
                quote: "",
                attemptNo: 1
            },

            scenario: `本次第${step.id}步描述未交代“${point.label}”的判断依据。`,
            impact: "方案的异常处理路径无法被复核。",
            causeBoundary: "只能说明本次文字信息不足，不推断学习习惯。",
            action: point.hints[2],
            check: `修订后应能定位到“${point.label}”对应的原因、动作与判断标准。`
        })),

        strengths: step.keyPoints.slice(0, 3).map(point => `已覆盖“${point.label}”。`),
        reasoningReview: "这是功能预览：正式评阅会给出完整推理点评。",
        standardAnswer: "本步参考要点：" + step.keyPoints.map(point => point.label).join("；") + "。",
        improvedAnswer: "预览模式不提供改写示例；正式评阅会基于你的回答给出推荐改写。",
        knowledgeExplanation: "预览模式：正式评阅会结合知识点给出详细讲解。",
        nextAction: "预览通过后可进入下一步。"
    };
}

export default function StepWorkstation(
    {
        session,
        stepId,
        catalog = experimentSteps,
        preview = false,
        canSwitchToTeacher = false,
        onBack,
        onSessionUpdate,
        onOpenReport
    }: Props
) {
    const step = catalog.find(item => item.id === stepId) ?? experimentSteps[stepId - 1];
    const [stage, setStage] = useState(0);
    const [descs, setDescs] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [syncNotice, setSyncNotice] = useState("");
    const [railHint, setRailHint] = useState("");
    const [evaluation, setEvaluation] = useState<TextEvaluation | null>(null);
    const [draftNotice, setDraftNotice] = useState("草稿保存在当前浏览器");
    const draftKey = `ljbio-description-v2:${session.sessionId}:${stepId}`;
    const loadedDraft = useRef<string | null>(null);
    const [draftReady, setDraftReady] = useState(false);
    const [quizCompleted, setQuizCompleted] = useState(false);
    const stageRestored = useRef(false);
    useEffect(() => {
        if (stageRestored.current || !draftReady) return;
        let requested = 0;
        try { requested = Number(new URLSearchParams(window.location.search).get("stage") ?? localStorage.getItem(draftKey + ":stage") ?? 0); } catch {}
        if (requested >= 2 && !quizCompleted) return;
        if (requested === 3 && !evaluation) requested = 2;
        setStage(Number.isInteger(requested) && requested >= 0 && requested <= 3 ? requested : 0);
        stageRestored.current = true;
    }, [draftKey, draftReady, quizCompleted, evaluation]);
    useEffect(() => {
        if (!stageRestored.current) return;
        try { localStorage.setItem(draftKey + ":stage", String(stage)); } catch {}
    }, [draftKey, stage]);

    useEffect(() => {
        if (loadedDraft.current === draftKey)
            return;
        loadedDraft.current = draftKey;
        let restored: Record<string, string> = {};
        const lastAnswer = [...session.messages].reverse().find(message => message.role === "user" && message.stepId === stepId && message.content.includes("【"));
        if (lastAnswer) {
            for (const point of step.keyPoints) {
                const marker = "【" + point.label + "】";
                const start = lastAnswer.content.indexOf(marker);
                if (start >= 0) restored[point.id] = lastAnswer.content.slice(start + marker.length).split("\n【")[0].trim();
            }
        }
        const previousEvaluation = [...session.messages].reverse().find(message => message.stepId === stepId && message.evaluation)?.evaluation;
        if (previousEvaluation) setEvaluation(previousEvaluation);
        try {
            const saved = localStorage.getItem(draftKey);
            if (saved) {
                const parsed: unknown = JSON.parse(saved);
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
                    restored = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
            }
            setDraftNotice(saved ? "已恢复当前浏览器草稿" : lastAnswer ? "已恢复上次提交的方案" : "草稿保存在当前浏览器");
        } catch { setDraftNotice("无法读取浏览器草稿，已恢复可用的提交记录"); }
        setDescs(restored); setDraftReady(true);
    }, [draftKey, session.messages, step.keyPoints, stepId]);

    useEffect(() => {
        if (!draftReady || loadedDraft.current !== draftKey)
            return;

        try {
            localStorage.setItem(draftKey, JSON.stringify(descs));
        } catch { setDraftNotice("草稿保存失败，请保留当前页面并手动复制内容"); }
    }, [descs, draftKey, draftReady]);

    const quizOk = quizCompleted;
    const describedCount = step.keyPoints.filter(point => (descs[point.id] || "").trim().length >= MIN_DESC_LENGTH).length;
    const descComplete = describedCount === step.keyPoints.length;
    const isCurrent = preview || session.currentStep === stepId;
    const submittedAnswer = step.keyPoints.map(point => `【${point.label}】${(descs[point.id] || "").trim()}`).join("\n");

    function stageUnlocked(index: number): boolean {
        if (index <= 1)
            return true;

        if (index === 2)
            return quizOk;

        return quizOk && descComplete && evaluation !== null;
    }

    function goTo(index: number) {
        if (stageUnlocked(index)) {
            setStage(index);
            setRailHint("");
            return;
        }

        if (index === 2)
            setRailHint("先完成「知识检验」作答，才能进入分步文字推演。");
        else
            setRailHint("先用自己的话完成全部子步骤描述并提交，AI 才会生成点评与本步报告。");
    }

    function saveDraft() {
        try {
            localStorage.setItem(draftKey, JSON.stringify(descs));
            setDraftNotice("已保存到当前浏览器");
        } catch {
            setDraftNotice("当前浏览器无法保存草稿");
        }
    }

    async function submitEvaluation() {
        if (busy)
            return;

        if (!isCurrent) {
            setError("当前不是本步骤，请切回当前步骤后再提交。");
            return;
        }

        if (!descComplete) {
            const missing = step.keyPoints.map((point, idx) => ({
                point,
                idx
            })).filter((
                {
                    point
                }
            ) => (descs[point.id] || "").trim().length < MIN_DESC_LENGTH);

            const previewList = missing.slice(0, 3).map(m => `「${m.point.label}」`).join("、");
            const more = missing.length > 3 ? ` 等共 ${missing.length} 条` : "";
            setError(`还有 ${missing.length} 条未完成作答：${previewList}${more}。请用自己的话补充各环节后再提交。`);
            return;
        }

        setBusy(true);
        setError("");
        setSyncNotice("");
        const answer = submittedAnswer;

        if (preview) {
            setEvaluation(previewEvaluation(step));
            setBusy(false);
            setStage(3);
            return;
        }

        try {
            const requestKey = crypto.randomUUID();

            const result = await api<{
                evaluation: TextEvaluation;
                session: StudentSessionView;
                chaoxingTaskflow?: ChaoxingTaskflowPayload;
            }>("/api/student/evaluate", {
                sessionId: session.sessionId,
                stepNo: stepId,
                answer,
                requestId: requestKey
            });

            const lastIndex = result.session.messages.length - 1;

            if (lastIndex >= 0) result.session.messages[lastIndex] = {
                ...result.session.messages[lastIndex],
                evaluation: result.evaluation
            };

            setEvaluation(result.evaluation);
            onSessionUpdate(result.session);
            setStage(3);

            if (result.chaoxingTaskflow) {
                try {
                    const dispatch = await dispatchChaoxingTaskflow(result.chaoxingTaskflow);
                    setSyncNotice(dispatch.detail);
                } catch {
                    setSyncNotice("本次评阅已保存；超星网页桥接暂不可用，服务器同步队列会保留记录。");
                }
            } else {
                setSyncNotice("本次记录已保存；非正式学生会话不会写入超星。");
            }
        } catch (reason) {
            setError(clientErrorMessage(reason, "评阅失败，请稍后重试"));
        } finally {
            setBusy(false);
        }
    }

    const gatePassed = evaluation?.decision === "pass";

    return (
        <div
            className="workstation-shell watercolor-student-task text-foreground font-sans">
            <PageBackground />
            <StudentTopbar
                title={`步骤 ${stepId} · ${step.shortTitle}`}
                subtitle={`阶段 ${stage + 1} / ${STAGE_LABELS.length} · ${STAGE_LABELS[stage]}`}
                onBack={onBack}
                backLabel="实验地图"
                onOpenReport={onOpenReport}
                showTeacherSwitch={canSwitchToTeacher} />
            <div
                className="workstation-layout mx-auto max-w-[1500px] px-4 sm:px-6 py-4 pb-8">
                <main className="student-stage-canvas min-w-0">
                    <header className="workstation-step-heading flex flex-wrap items-center gap-3">
                        <span
                            className="shrink-0 w-9 h-9 rounded-full bg-secondary text-primary-foreground text-sm font-black flex items-center justify-center"
                            aria-hidden>{STEP_BADGES[stepId - 1]}</span>
                        <div className="step-heading-copy">
                            <h1>{step.title}</h1>
                            <p>{step.goal}</p>
                        </div>
                        <span className={`step-gate-state ${gatePassed ? "is-passed" : "is-pending"}`}><Flag aria-hidden />Gate {stepId}· {gatePassed ? "已通过" : "待通过"}</span>
                    </header>
                    <section
                        className="workstation-card student-stage-navigation mt-4 rounded-2xl p-3">
                        <div className="stage-strip flex flex-wrap gap-1.5">
                            {STAGE_LABELS.map((label, index) => {
                                const Icon = STAGE_ICONS[index];
                                const unlocked = stageUnlocked(index);
                                const active = stage === index;
                                const past = unlocked && index < stage;

                                return (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => goTo(index)}
                                        disabled={!unlocked}
                                        className={`inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${active ? "bg-primary text-primary-foreground border-primary shadow-sm" : past ? "bg-success-container text-success border-success/40" : unlocked ? "bg-card text-foreground border-border hover:bg-muted cursor-pointer" : "bg-muted text-muted-foreground border-border/60 cursor-not-allowed"}`}>
                                        <span
                                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${active ? "bg-primary-foreground/20" : past ? "bg-success/15" : "bg-muted-foreground/15"}`}>{past ? "✓" : index + 1}</span>
                                        <Icon className="w-3.5 h-3.5" />
                                        <span className="stage-label-desktop">{label}</span>
                                        <span className="stage-label-mobile">{STAGE_MOBILE_LABELS[index]}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {railHint && <p className="mt-2 text-xs font-bold text-warning flex items-center gap-1.5"><CircleAlert className="w-3.5 h-3.5 shrink-0" />{railHint}</p>}
                    </section>
                    {stage === 0 && <TaskPrinciples step={step} sessionId={session.sessionId} preview={preview} />}
                    <div hidden={stage !== 1}><QuizPanel key={session.sessionId + "-quiz-" + stepId} stepNo={stepId} preview={preview} onCompleted={() => setQuizCompleted(true)} onContinue={() => setStage(2)} /></div>
                    {stage === 2 && <ExperimentWriter step={step} answers={descs} onChange={setDescs} onSubmit={() => void submitEvaluation()} busy={busy} error={error} draftNotice={draftNotice} isCurrent={isCurrent} />}
                    {stage === 3 && evaluation && <section className="student-stage-panel student-stage-panel-review"><StepReviewReport
                            step={step}
                            evaluation={evaluation}
                            answers={descs}
                            syncNotice={syncNotice}
                            onRevise={() => setStage(2)}
                            onBack={onBack} /></section>}
                    <footer
                        className="workstation-footer mt-6 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => goTo(stage - 1)}
                            disabled={stage === 0}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-card border border-border text-xs font-semibold text-muted-foreground shadow-card disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:bg-muted transition-colors"><ArrowLeft className="w-4 h-4" />上一阶段</button>
                        {stage === 2 ? <button
                            type="button"
                            aria-label="保存文字推演草稿"
                            onClick={saveDraft}
                            className="draft-save-button inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-secondary shadow-card"><Save className="w-4 h-4" /><span className="hidden sm:inline">保存草稿</span></button> : <p className="hidden sm:block text-xs font-semibold text-muted-foreground">阶段 {stage + 1}/ {STAGE_LABELS.length}· {STAGE_LABELS[stage]}</p>}
                        <button
                            type="button"
                            onClick={() => goTo(stage + 1)}
                            disabled={stage >= STAGE_LABELS.length - 1 || !stageUnlocked(stage + 1)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-card disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">下一阶段 <ArrowRight className="w-4 h-4" /></button>
                    </footer>
                </main>
            </div>
            {(stage === 0 || stage === 3) && <GlobalAiTutor
                sessionId={session.sessionId}
                step={step}
                mode={stage === 3 ? "review" : "task"}
                messages={session.messages}
                preview={preview} />}
        </div>
    );
}
