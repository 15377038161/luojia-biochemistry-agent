import { BarChart3, BookCheck, Check, CircleAlert, Flag, Lightbulb, RotateCcw } from 'lucide-react';
import type { DimensionScores, ExperimentStep, TextEvaluation } from '@/domain/agent';
import { buildStepReviewRows, getStepLearningSummary } from '@/lib/step-learning-report';

const DIMENSIONS: Array<{ key: keyof DimensionScores; label: string; max: number }> = [
  { key: 'knowledge', label: '知识理解', max: 20 }, { key: 'operation', label: '操作描述', max: 30 },
  { key: 'decision', label: '科学决策', max: 20 }, { key: 'troubleshooting', label: '问题解决', max: 15 },
  { key: 'analysis', label: '结果分析', max: 15 },
];

interface Props {
  step: ExperimentStep;
  evaluation: TextEvaluation;
  answers: Record<string, string>;
  syncNotice: string;
  onRevise: () => void;
  onBack: () => void;
}

export default function StepReviewReport({ step, evaluation, answers, syncNotice, onRevise, onBack }: Props) {
  const rows = buildStepReviewRows(step, evaluation, answers);
  const summary = getStepLearningSummary(step, evaluation);
  const total = DIMENSIONS.reduce((sum, item) => sum + evaluation.scores[item.key], 0);
  const passed = evaluation.decision === 'pass';

  return (
    <section className="mt-4 space-y-4">
      <div className={`rounded-2xl border p-5 ${passed ? 'border-success/35 bg-success/10' : 'border-warning/35 bg-warning/10'}`}>
        <div className="flex flex-wrap items-start gap-3"><div><p className="text-xs font-black text-primary">AI 点评已生成 · 本步学习报告</p><h2 className="mt-1 text-xl font-extrabold">{passed ? '本步达标，可以继续' : '本步需要修订后再通过 Gate'}</h2></div><span className="ml-auto rounded-full bg-card px-3 py-1 text-sm font-black text-primary">{total}/100</span></div>
        <p className="mt-3 text-sm leading-7">{evaluation.studentFeedback}</p>
        {syncNotice && <p className="mt-2 text-xs font-bold text-primary"><Check className="mr-1 inline h-3.5 w-3.5" />{syncNotice}</p>}
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-card">
        <h3 className="flex items-center gap-2 text-base font-extrabold"><BookCheck className="h-5 w-5 text-primary" />逐项回答诊断</h3>
        <p className="mt-1 text-xs text-muted-foreground">AI 逐条对照你的原文与课程评分要点，告诉你答得怎样、该如何改。</p>
        <div className="mt-4 space-y-3">
          {rows.map((row, index) => {
            const good = row.status === '讲清楚了';
            return <article key={row.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-container text-xs font-black text-primary">{index + 1}</span><h4 className="font-bold">{row.label}</h4><span className={`ml-auto rounded-full px-2 py-1 text-[11px] font-black ${good ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{row.status}</span></div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg bg-muted/60 p-3 text-xs leading-6"><p className="font-black text-foreground">你的回答</p><p className="mt-1 text-muted-foreground">{row.studentEvidence}</p></div>
                <div className="rounded-lg bg-primary-container/35 p-3 text-xs leading-6"><p className="font-black text-primary">AI 点评与改法</p><p className="mt-1">{row.feedback}</p></div>
              </div>
              <details className="mt-3 rounded-lg border border-secondary/20 bg-secondary-container/25 p-3 text-xs leading-6"><summary className="cursor-pointer font-black text-secondary">查看参考答案与评分要点</summary><p className="mt-2">{row.referenceAnswer}</p><p className="mt-2 text-muted-foreground">这是课程资料中的参考作答框架，不是唯一表述；答案需同时写明条件、依据、判断和后续动作。</p></details>
            </article>;
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/90 p-5 shadow-card">
        <h3 className="flex items-center gap-2 text-base font-extrabold"><BarChart3 className="h-5 w-5 text-secondary" />{summary.title}</h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">{DIMENSIONS.map((item) => <div key={item.key} className="rounded-xl bg-muted/60 p-3 text-xs"><p className="font-bold">{item.label}</p><p className="mt-1 text-lg font-black text-primary">{evaluation.scores[item.key]}<span className="text-xs font-normal text-muted-foreground">/{item.max}</span></p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card"><div className="h-full rounded-full bg-primary" style={{ width: `${evaluation.scores[item.key] / item.max * 100}%` }} /></div></div>)}</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-success/8 p-4 text-xs leading-6"><p className="font-black text-success"><Check className="mr-1 inline h-4 w-4" />本步优势</p>{summary.strengths.map((item) => <p key={item}>· {item}</p>)}</div><div className="rounded-xl bg-warning/8 p-4 text-xs leading-6"><p className="font-black text-warning"><Lightbulb className="mr-1 inline h-4 w-4" />下一次学习动作</p>{summary.actions.slice(0, 4).map((item) => <p key={item}>· {item}</p>)}</div></div>
      </div>

      <div className={`rounded-2xl border p-5 text-center ${passed ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10'}`}><p className={`text-lg font-black ${passed ? 'text-success' : 'text-warning'}`}><Flag className="mr-2 inline h-5 w-5" />Gate {step.id} · {passed ? '通过' : '待通过'}</p><p className="mt-2 text-xs text-muted-foreground">{passed ? '本步报告已计入总学习报告，下一实验步骤已解锁。' : '请依据逐项点评修改后再次提交；新评阅会更新本步报告。'}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button type="button" onClick={onRevise} className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold"><RotateCcw className="h-4 w-4" />修改并重新提交</button>{passed && <button type="button" onClick={onBack} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">返回实验地图</button>}</div>{evaluation.safetyAlerts.length > 0 && <p className="mt-3 text-xs font-bold text-destructive"><CircleAlert className="mr-1 inline h-4 w-4" />有 {evaluation.safetyAlerts.length} 项安全问题必须修正。</p>}</div>
    </section>
  );
}
