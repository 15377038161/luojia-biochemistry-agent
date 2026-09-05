"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ExperimentStep, TextEvaluation } from "@/domain/agent";
import { Button } from "@/components/ui/button";
import { buildStepReviewRows } from "@/lib/step-learning-report";
import { computeGradeSummary } from "@/lib/services/grading";
import AbilityRadar from "./ability-radar";
interface Props { step: ExperimentStep; evaluation: TextEvaluation; answers: Record<string, string>; syncNotice: string; onRevise: () => void; onBack: () => void }
export default function StepReviewReport({ step, evaluation, answers, syncNotice, onRevise, onBack }: Props) {
  const [tab, setTab] = useState("overview");
  const rows = buildStepReviewRows(step, evaluation, answers);
  const passed = evaluation.decision === "pass";
  const grading = useMemo(() => computeGradeSummary({
    sessionId: "step-review", completedAt: null, finalization: null, hasPendingAppeal: false,
    stepStates: [{ stepNo: step.id, status: passed ? "passed" : "active", attemptCount: 1, passedAt: null }],
    evaluations: [{ id: "current", stepNo: step.id, versionNo: 1, decision: evaluation.decision, totalScore: Object.values(evaluation.scores).reduce((sum, n) => sum + n, 0), scores: evaluation.scores, requiresTeacherReview: evaluation.requiresTeacherReview, result: { evaluation }, createdAt: "2000-01-01T00:00:00Z" }],
  }), [evaluation, passed, step.id]);
  const urgent = rows.filter(row => row.status !== "讲清楚了");
  return <section className="learning-paper step-review-paper">
    <header className="learning-section-heading"><div><span className="learning-eyebrow">04 / REFLECT & IMPROVE</span><h2>{passed ? "本步达标，继续探索" : "把这些细节再讲清楚"}</h2><p>第 {step.id} 步 · {step.shortTitle} · AI 暂定评阅{evaluation.requiresTeacherReview ? " · 待教师复核" : ""}</p></div><span className="learning-status">Gate {step.id} · {passed ? "通过" : "待通过"}</span></header>
    <nav className="learning-tabs" aria-label="本步报告分区">{[["overview", "学习概况"], ["radar", "五维能力"], ["evidence", "逐项证据"], ["resources", "改进与资料"]].map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === "overview" && <div><p className="report-lead">{evaluation.studentFeedback}</p><h3 className="mt-6">优先回顾</h3>{urgent.length ? urgent.slice(0, 3).map(row => <details key={row.id} className="learning-disclosure"><summary>{row.label} · {row.status}</summary><p>{row.feedback}</p></details>) : <p className="learning-notice">本次评阅未发现需要优先修订的项目。</p>}<p className="learning-muted mt-4">{evaluation.nextAction}</p><Button variant="outline" onClick={() => setTab("evidence")}>查看全部作答证据</Button></div>}
    {tab === "radar" && <><AbilityRadar dimensions={grading.radar_dimensions} /><p className="learning-muted">五维能力按本次已评阅证据归一化至 0–100；课程总成绩请查看独立学习报告。</p></>}
    {tab === "evidence" && <div>{rows.map(row => <details key={row.id} className="learning-disclosure"><summary>{row.label} · {row.status}</summary><div className="report-evidence-pair"><blockquote><strong>你的原文</strong><p>{row.studentEvidence}</p></blockquote><div><strong>点评与改法</strong><p>{row.feedback}</p></div></div>{passed && <details className="mt-4"><summary>参考作答要点</summary><p>{row.referenceAnswer}</p></details>}</details>)}</div>}
    {tab === "resources" && <div>
      <h3>下一步行动</h3><p className="report-lead">{evaluation.nextAction}</p><p className="mt-4">{evaluation.reasoningReview}</p>
      {passed ? [["修订答案", evaluation.improvedAnswer], ["完整参考答案", evaluation.standardAnswer], ["详细原理解读", evaluation.knowledgeExplanation]].map(([label, text]) => <details key={label} className="learning-disclosure"><summary>{label}</summary><p className="whitespace-pre-wrap">{text || "本次评阅尚未生成此部分。"}</p></details>) : <p className="learning-notice">先依据逐项诊断完善你的表达。本步正式结束后，可在报告中回顾完整参考答案。</p>}
      <p className="learning-source">课程资料：{step.source}</p><Link className="underline" href={"/student/report?step=" + step.id}>打开独立学习报告</Link>
    </div>}
    {syncNotice && <p role="status" className="learning-muted mt-6">{syncNotice}</p>}
    <footer className="learning-actions"><Button variant="outline" onClick={onRevise}>返回方案修订</Button>{passed && <Button onClick={onBack}>返回地图 · 进入下一步</Button>}</footer>
  </section>;
}
