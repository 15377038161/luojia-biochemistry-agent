"use client";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lightbulb, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExperimentStep } from "@/domain/agent";

const prompts = [
  ["操作目的", "这一步解决什么问题？它与前后操作有什么联系？"],
  ["顺序与条件", "先做什么、后做什么？涉及的时间、温度、浓度和单位交代了吗？"],
  ["器材与用途", "使用什么器材？凭哪些外观特征识别？如何设置和安全使用？"],
  ["观察与判断", "预计看到什么？用什么对照判断？异常时先检查哪里？"],
];
export default function ExperimentWriter({ step, answers, onChange, onSubmit, busy, error, draftNotice, isCurrent, phase = "evaluating" }: {
  step: ExperimentStep; answers: Record<string, string>; onChange: (value: Record<string, string>) => void;
  onSubmit: () => void; busy: boolean; error: string; draftNotice: string; isCurrent: boolean;
  phase?: "preparing" | "evaluating";
}) {
  const [index, setIndex] = useState(0);
  const [overview, setOverview] = useState(false);
  const [notice, setNotice] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const point = step.keyPoints[index];
  const completed = step.keyPoints.filter(p => Boolean(answers[p.id]?.trim())).length;
  function navigate(next: number) { setIndex(next); setOverview(false); setNotice(""); }
  function confirm() {
    const missing = step.keyPoints.findIndex(p => !answers[p.id]?.trim());
    if (missing >= 0) { setIndex(missing); setOverview(false); setNotice("请先用自己的话补充这个环节。"); setTimeout(() => editor.current?.focus(), 0); return; }
    onSubmit();
  }
  return <section className="learning-paper experiment-writer">
    <header className="learning-section-heading"><div><span className="learning-eyebrow">03 / EXPLAIN YOUR EXPERIMENT</span><h2>{overview ? "检查你的完整实验方案" : "把实验讲清楚"}</h2><p>想象同伴需要按你的说明复现实验。用自己的话连接目的、操作和判断。</p></div><PenLine className="section-mark" aria-hidden /></header>
    <div className="writer-progress"><span>已填写 {completed} / {step.keyPoints.length} 个环节</span><span role="status">{draftNotice}</span></div>
    <progress value={completed} max={step.keyPoints.length} aria-label="填写进度" className="writer-progress-bar" />
    <div className="writer-layout">
      <nav className="writer-outline" aria-label="操作环节">
        <p className="learning-eyebrow">操作目录</p>
        {step.keyPoints.map((p, i) => <button key={p.id} type="button" disabled={busy} aria-current={!overview && index === i ? "step" : undefined} onClick={() => navigate(i)}><span>{answers[p.id]?.trim() ? <Check size={16} /> : String(i + 1).padStart(2, "0")}</span>{p.label}</button>)}
        <button type="button" disabled={busy} aria-current={overview ? "step" : undefined} onClick={() => setOverview(true)}>整合与提交<ArrowRight size={16} /></button>
      </nav>
      <div className="writer-editor">
        {overview ? <div><span className="learning-eyebrow">YOUR EXPERIMENT NOTEBOOK</span><h3>按操作顺序，再读一遍</h3><p className="learning-muted">“已填写”只表示有作答，理解是否准确将在提交后评阅。</p>
          {step.keyPoints.map((p, i) => <article key={p.id} className="writer-summary"><header><h4>{i + 1}. {p.label}</h4><Button variant="ghost" disabled={busy} onClick={() => navigate(i)}>修改</Button></header><p>{answers[p.id]?.trim() || "尚未填写"}</p></article>)}
          <div className="learning-actions"><Button variant="outline" disabled={busy} onClick={() => setOverview(false)}>返回编辑</Button><Button onClick={confirm} disabled={busy || !isCurrent}>{busy ? (phase === "preparing" ? "正在提交…" : "正在评阅，请保留页面…") : "确认提交实验方案"}</Button></div>
          {!isCurrent && <p className="learning-notice">当前为历史步骤，可回顾原作答；正式提交请返回当前实验步骤。</p>}
        </div> : <>
          <span className="learning-eyebrow">环节 {String(index + 1).padStart(2, "0")} / {step.keyPoints.length}</span>
          <h3 id={"writer-title-" + point.id}>{point.label}</h3>
          <p className="learning-muted">说明你准备怎样操作，并解释这样安排的原因。</p>
          <label className="sr-only" htmlFor="experiment-description">我的操作描述</label>
          <textarea ref={editor} id="experiment-description" aria-labelledby={"writer-title-" + point.id} disabled={busy} rows={10} value={answers[point.id] || ""} onChange={e => onChange({ ...answers, [point.id]: e.target.value })} placeholder="先说明这一步的目的，再写操作顺序、关键条件、器材与判断依据。请按你的理解组织语言。" />
          <div className="writer-input-meta"><span>{answers[point.id]?.trim() ? "已填写 · 提交后评阅" : "尚未填写"}</span><span>{(answers[point.id] || "").length} 字</span></div>
          <div className="learning-actions"><Button variant="outline" disabled={index === 0 || busy} onClick={() => navigate(index - 1)}><ArrowLeft />上一环节</Button><Button disabled={busy} onClick={() => index === step.keyPoints.length - 1 ? setOverview(true) : navigate(index + 1)}>{index === step.keyPoints.length - 1 ? "整合实验方案" : "下一环节"}<ArrowRight /></Button></div>
        </>}
        {(notice || error) && <p className="learning-notice is-error" role="alert">{notice || error}</p>}
      </div>
      <aside className="writer-guidance"><details open><summary><Lightbulb size={18} />思考提示</summary><p className="learning-muted">提示帮你检查表达，完整参考答案在本步正式结束后查看。</p>
        {prompts.map(([label, prompt]) => <details key={label} className="writer-prompt"><summary title={prompt}>{label}</summary><p>{prompt}</p></details>)}
        <div className="writer-instruments"><h4>本步器材</h4><p>{step.instruments.join("、")}</p><p>请选择与当前操作有关的器材，解释识别依据和功能。</p></div>
      </details></aside>
    </div>
  </section>;
}
