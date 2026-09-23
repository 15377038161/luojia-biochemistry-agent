"use client";
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
  const rows = buildStepReviewRows(step, evaluation, answers);
  const passed = evaluation.decision === "pass";
  const totalScore = Object.values(evaluation.scores).reduce((sum, n) => sum + n, 0);
  const needsWork = rows.filter(row => row.status !== "讲清楚了");

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
    return { ...meta, score, issues, subRows };
  });

  const verdictPill = passed
    ? "report-verdict-pass"
    : evaluation.decision === "teacher_review" ? "report-verdict-review" : "report-verdict-revise";
  const verdictText = passed ? "本步达标" : evaluation.decision === "teacher_review" ? "待教师复核" : "需要改进";

  return <section className="learning-paper step-review-paper">
    <header className="learning-section-heading"><div><span className="learning-eyebrow">04 / REFLECT & IMPROVE</span><h2>第 {step.id} 步 · {step.shortTitle}</h2><p>AI 暂定评阅{evaluation.requiresTeacherReview ? " · 待教师复核" : ""}</p></div><span className="learning-status">Gate {step.id} · {passed ? "通过" : "待通过"}</span></header>

    {/* 核心结论 Hero：置顶常驻，结论/得分/下一步一眼可见 */}
    <div className="report-hero">
      <div className="report-hero-score">
        <strong>{totalScore}</strong>
        <span>本步总分 / 100</span>
      </div>
      <div className="report-hero-body">
        <div className="report-hero-verdict">
          <span className={`report-verdict-pill ${verdictPill}`}>{verdictText}</span>
          <span className="report-tag report-tag-strength">{rows.filter(r => r.status === "讲清楚了").length}/{rows.length} 项讲清楚</span>
        </div>
        <p className="report-hero-conclusion">{evaluation.studentFeedback}</p>
        {evaluation.nextAction && <p className="report-hero-next"><b>下一步：</b>{evaluation.nextAction}</p>}
      </div>
    </div>

    {/* 五维得分概览 */}
    <div className="report-section">
      <div className="report-section-header"><span className="report-section-index">1</span><h4>五维能力得分</h4><p>按教师要求的五个维度拆解</p></div>
      <div className="report-section-body">
        <div className="step-dimension-grid" style={{ marginTop: 0 }}>
          {dimensionAnalysis.map(dim => <article key={dim.key} className="step-dimension-card">
            <header><h4>{dim.label}</h4><span className="learning-status">{dim.score}/{dim.max} 分</span></header>
            <div className="dimension-bar"><div className={`dimension-bar-fill ${barColor(dim.score, dim.max)}`} style={{ width: `${Math.round((dim.score / dim.max) * 100)}%` }} /></div>
            <p className="dimension-level">{levelName(dim.score, dim.max)}</p>
          </article>)}
        </div>
      </div>
    </div>

    {/* 逐项对比：原文 vs 标准答案 */}
    <div className="report-section">
      <div className="report-section-header"><span className="report-section-index">2</span><h4>逐项对比</h4><p>你的原文 · 标准答案要点</p></div>
      <div className="report-section-body">
        {needsWork.length > 0 && (
          <div className="mb-4">
            <span className="report-tag report-tag-gap">需要改进 {needsWork.length} 项</span>
            <p className="report-section-body" style={{ padding: 0, marginTop: 8 }}>以下环节还差关键信息，对照标准答案补齐即可。</p>
          </div>
        )}
        {rows.map(row => <details key={row.id} className="learning-disclosure step-evidence-disclosure" open={row.status !== "讲清楚了"}>
          <summary>{row.label} · {row.status}</summary>
          <div className="report-evidence-pair">
            <blockquote><strong>你的原文</strong><p>{row.studentEvidence}</p></blockquote>
            <div><strong>标准答案要点</strong><p>{row.referenceAnswer}</p></div>
          </div>
          <p className="step-evidence-feedback"><b>点评与改法：</b>{row.feedback}</p>
        </details>)}
      </div>
    </div>

    {/* 标准答案与推荐材料 */}
    <div className="report-section">
      <div className="report-section-header"><span className="report-section-index">3</span><h4>标准答案与推荐材料</h4><p>参考答案 · 原理 · 学习资料</p></div>
      <div className="report-section-body">
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="report-tag report-tag-resource">完整参考答案</span>
          <span className="report-tag report-tag-resource">原理解读</span>
          <span className="report-tag report-tag-resource">学习资料</span>
        </div>
        {!passed && <p className="learning-notice">先依据逐项对比完善表达；本步正式结束后，可在完整学习报告中回顾全部参考答案。</p>}
        {passed && <>
          {[[ "完整参考答案", evaluation.standardAnswer ], [ "基于你原文的改写", evaluation.improvedAnswer ], [ "本步原理讲解", evaluation.knowledgeExplanation ]].map(([label, text]) => <details key={label} className="learning-disclosure"><summary>{label}</summary><p className="whitespace-pre-wrap">{text || "本次评阅尚未生成此部分。"}</p></details>)}
        </>}
        <h4 className="mt-6 mb-2">配套学习推荐材料</h4>
        <div className="step-resource-grid" style={{ marginTop: 0 }}>
          {resourceItems.map((item, index) => <article key={index} className="step-resource-card"><span className="learning-eyebrow">资料 {String(index + 1).padStart(2, "0")}</span><h4>{item.label}</h4><p>{item.part}</p></article>)}
        </div>
        {step.principle && <details className="learning-disclosure mt-4"><summary>本步核心原理</summary><p className="whitespace-pre-wrap">{step.principle}</p></details>}
        <p className="learning-muted mt-4"><Link className="underline" href={"/student/report?step=" + step.id}>打开完整学习报告</Link></p>
      </div>
    </div>

    {syncNotice && <p role="status" className="learning-muted mt-6">{syncNotice}</p>}
    <footer className="learning-actions"><Button variant="outline" onClick={onRevise}>返回方案修订</Button>{passed && <Button onClick={onBack}>返回地图 · 进入下一步</Button>}</footer>
  </section>;
}
