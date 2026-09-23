"use client";
import { useState } from "react";
import Link from "next/link";
import type { ExperimentStep, TextEvaluation, DimensionScores } from "@/domain/agent";
import { Button } from "@/components/ui/button";
import { buildStepReviewRows } from "@/lib/step-learning-report";

interface Props { step: ExperimentStep; evaluation: TextEvaluation; answers: Record<string, string>; syncNotice: string; onRevise: () => void; onBack: () => void }

// 五个评阅维度及其满分（与评阅口径一致）。
const DIMENSION_META: Array<{ key: keyof DimensionScores; label: string; max: number }> = [
  { key: "knowledge", label: "知识理解", max: 20 },
  { key: "operation", label: "操作描述", max: 30 },
  { key: "decision", label: "科学决策", max: 20 },
  { key: "troubleshooting", label: "问题解决", max: 15 },
  { key: "analysis", label: "结果分析与判断", max: 15 },
];

function levelName(score: number, max: number): string {
  const percent = (score / max) * 100;
  if (percent >= 85) return "掌握扎实";
  if (percent >= 70) return "基本达标";
  return "需要加强";
}

function barColor(score: number, max: number): string {
  const percent = (score / max) * 100;
  if (percent >= 85) return "bg-success";
  if (percent >= 70) return "bg-primary";
  return "bg-warning";
}

export default function StepReviewReport({ step, evaluation, answers, syncNotice, onRevise, onBack }: Props) {
  const [tab, setTab] = useState("overview");
  const rows = buildStepReviewRows(step, evaluation, answers);
  const passed = evaluation.decision === "pass";
  const urgent = rows.filter(row => row.status !== "讲清楚了");

  // 推荐材料：解析本步课程资料来源，拆分为可点读的学习材料清单。
  const resourceItems = step.source
    .split("；")
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const colon = item.indexOf(" ");
      const label = colon > 0 ? item.slice(0, colon) : item;
      const part = colon > 0 ? item.slice(colon + 1) : "";
      return { label, part };
    });

  // 五维逐项分析：按维度聚合小步骤与诊断，明确每维得分与对应问题。
  const dimensionAnalysis = DIMENSION_META.map(meta => {
    const points = step.keyPoints.filter(point => point.dimension === meta.key);
    const score = evaluation.scores[meta.key] ?? 0;
    const issues = evaluation.detailedIssues.filter(issue => issue.dimension === meta.key);
    const subRows = points.map(point => rows.find(row => row.id === point.id)).filter((row): row is NonNullable<typeof row> => Boolean(row));
    return { ...meta, score, points, issues, subRows };
  });

  return <section className="learning-paper step-review-paper">
    <header className="learning-section-heading"><div><span className="learning-eyebrow">04 / REFLECT & IMPROVE</span><h2>{passed ? "本步达标，继续探索" : "把这些细节再讲清楚"}</h2><p>第 {step.id} 步 · {step.shortTitle} · AI 暂定评阅{evaluation.requiresTeacherReview ? " · 待教师复核" : ""}</p></div><span className="learning-status">Gate {step.id} · {passed ? "通过" : "待通过"}</span></header>

    <nav className="learning-tabs" aria-label="本步报告分区">{[["overview", "学习概况"], ["dimensions", "五维逐项"], ["evidence", "逐项对比"], ["resources", "标准答案与资料"]].map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>)}</nav>

    {tab === "overview" && <div>
      <p className="report-lead">{evaluation.studentFeedback}</p>
      <h3 className="mt-6">优先回顾</h3>
      {urgent.length ? urgent.slice(0, 3).map(row => <details key={row.id} className="learning-disclosure"><summary>{row.label} · {row.status}</summary><p>{row.feedback}</p></details>) : <p className="learning-notice">本次评阅未发现需要优先修订的项目。</p>}
      <p className="learning-muted mt-4">{evaluation.nextAction}</p>
      <Button variant="outline" onClick={() => setTab("evidence")}>查看逐项原文对比</Button>
    </div>}

    {tab === "dimensions" && <div>
      <p className="learning-muted">按教师要求的五个维度，逐项拆解本步所有小步骤的得分与不足。雷达图用于八步全流程的整体评估，请查看完整学习报告。</p>
      <div className="step-dimension-grid">
        {dimensionAnalysis.map(dim => <article key={dim.key} className="step-dimension-card">
          <header><h4>{dim.label}</h4><span className="learning-status">{dim.score}/{dim.max} 分</span></header>
          <div className="dimension-bar"><div className={`dimension-bar-fill ${barColor(dim.score, dim.max)}`} style={{ width: `${Math.round((dim.score / dim.max) * 100)}%` }} /></div>
          <p className="dimension-level">{levelName(dim.score, dim.max)}</p>
          {dim.subRows.length > 0 && <div className="dimension-substeps">{dim.subRows.map(row => <div key={row.id} className="dimension-substep"><span className={`step-status-dot is-${row.status === "讲清楚了" ? "ok" : "warn"}`} />{row.label} · {row.status}</div>)}</div>}
          {dim.issues.map((issue, index) => <details key={index} className="learning-disclosure"><summary>{issue.title}</summary><p><b>影响：</b>{issue.impact}</p><p><b>改进：</b>{issue.action}</p><p><b>自检：</b>{issue.check}</p></details>)}
          {dim.issues.length === 0 && dim.subRows.every(row => row.status === "讲清楚了") && <p className="learning-notice">该维度已形成可核对的证据链。</p>}
        </article>)}
      </div>
    </div>}

    {tab === "evidence" && <div>
      <p className="learning-muted">每个小步骤并排展示「你的原文」与「标准答案要点」，对照即可定位缺失与偏差。</p>
      {rows.map(row => <details key={row.id} className="learning-disclosure step-evidence-disclosure">
        <summary>{row.label} · {row.status}</summary>
        <div className="report-evidence-pair">
          <blockquote><strong>你的原文</strong><p>{row.studentEvidence}</p></blockquote>
          <div><strong>标准答案要点</strong><p>{row.referenceAnswer}</p></div>
        </div>
        <p className="step-evidence-feedback"><b>点评与改法：</b>{row.feedback}</p>
      </details>)}
    </div>}

    {tab === "resources" && <div>
      <h3>标准答案与改写</h3>
      {[[ "完整参考答案", evaluation.standardAnswer ], [ "基于你原文的改写", evaluation.improvedAnswer ], [ "本步原理讲解", evaluation.knowledgeExplanation ]].map(([label, text]) => <details key={label} className="learning-disclosure"><summary>{label}</summary><p className="whitespace-pre-wrap">{text || "本次评阅尚未生成此部分。"}</p></details>)}
      <h3 className="mt-6">配套学习推荐材料</h3>
      <div className="step-resource-grid">
        {resourceItems.map((item, index) => <article key={index} className="step-resource-card"><span className="learning-eyebrow">资料 {String(index + 1).padStart(2, "0")}</span><h4>{item.label}</h4><p>{item.part}</p></article>)}
      </div>
      {step.principle && <details className="learning-disclosure mt-4"><summary>本步核心原理</summary><p className="whitespace-pre-wrap">{step.principle}</p></details>}
      <p className="learning-muted mt-4">{evaluation.nextAction}</p>
      <Link className="underline" href={"/student/report?step=" + step.id}>打开完整学习报告</Link>
    </div>}

    {syncNotice && <p role="status" className="learning-muted mt-6">{syncNotice}</p>}
    <footer className="learning-actions"><Button variant="outline" onClick={onRevise}>返回方案修订</Button>{passed && <Button onClick={onBack}>返回地图 · 进入下一步</Button>}</footer>
  </section>;
}
