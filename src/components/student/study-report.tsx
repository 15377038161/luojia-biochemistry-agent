'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, ChartNoAxesColumn, CircleAlert, Clock, Check, Download, FileText, Hourglass, Lightbulb, LoaderCircle, Radar as RadarIcon, ScanSearch, X } from 'lucide-react';
import type { ApiResult, DimensionScores } from '@/domain/agent';
import type { StudentReportData } from '@/app/api/student/report-data/route';
import { useSwipeDismiss } from '@/hooks/use-swipe-dismiss';
import StudentTopbar from '@/components/student/student-topbar';
import { clientErrorMessage } from '@/lib/client-request';

interface Props {
  name: string;
  sessionId: string;
  preview: boolean;
  markdown: string;
  markdownBusy: boolean;
  markdownError: string;
  syncNotice?: string;
  onClose: () => void;
  standalone?: boolean;
  practiceMode?: boolean;
  canSwitchToTeacher?: boolean;
}

interface GradeData {
  id: string;
  process_score: number | string;
  contribution_points: number | string;
  status: 'provisional' | 'review_required' | 'appealed' | 'final';
  review: { id: string; status: string; reason: string; resolution: string | null } | null;
}

const DIMENSIONS: Array<{ key: keyof DimensionScores; label: string; max: number; definition: string; standard: string }> = [
  { key: 'knowledge', label: '知识理解', max: 20, definition: '能否说清本步原理、术语和条件之间的关系。', standard: '按原理解释的准确性与完整性评分。' },
  { key: 'operation', label: '操作描述', max: 30, definition: '能否按顺序写清文字方案、关键条件和注意事项。', standard: '按步骤、条件和记录要素的完整度评分。' },
  { key: 'decision', label: '科学决策', max: 20, definition: '能否说明为什么选择某一方案或下一步。', standard: '按依据与选择是否对应评分。' },
  { key: 'troubleshooting', label: '问题解决', max: 15, definition: '能否识别异常并提出有依据的处理方向。', standard: '按异常识别与应对逻辑评分。' },
  { key: 'analysis', label: '结果分析与判断', max: 15, definition: '能否由案例结果推导出合理判断与后续动作。', standard: '按观察依据、判断与结论链条评分。' },
];

const PREVIEW_REPORT_DATA: StudentReportData = {
  totalScore: 86,
  grade: '良好',
  dimensions: { knowledge: 18, operation: 25, decision: 17, troubleshooting: 13, analysis: 13 },
  steps: [
    { stepNo: 1, shortTitle: '基因与引物', status: 'passed', attemptCount: 1, decision: 'pass', totalScore: 90, scores: null, missingLabels: [], issues: [] },
    { stepNo: 2, shortTitle: '载体构建', status: 'passed', attemptCount: 1, decision: 'pass', totalScore: 88, scores: null, missingLabels: [], issues: [] },
    { stepNo: 3, shortTitle: '转化与诱导', status: 'passed', attemptCount: 2, decision: 'pass', totalScore: 85, scores: null, missingLabels: [], issues: [] },
    { stepNo: 4, shortTitle: 'SDS-PAGE验证', status: 'teacher_review', attemptCount: 2, decision: 'revise', totalScore: 64, scores: null, missingLabels: ['缺超声破碎参数', '电泳条件描述模糊'], issues: [{ label: '缺超声破碎参数', kind: 'missing', dimension: 'operation', quote: '重悬后超声破碎，跑个胶看看', scenario: '在步骤4描述样品处理与表达验证时', impact: '他人无法按文字复核处理强度，也难以判断样品处理是否具有可重复性。', causeBoundary: '只能确认本次文字没有给出功率、工作/间隔时间和总时长，不能据此判断日常学习习惯。', action: '补写超声功率、工作/间隔节律、总时长与低温控制。', check: '下一版应能让同伴只依据文字列出全部处理条件。' }, { label: '电泳条件描述模糊', kind: 'ambiguous', dimension: 'analysis', scenario: '由案例胶图判断EGFP表达时', action: '写清目标条带位置、对照泳道和由观察到结论的推理链。', check: '判断中同时出现观察依据、结论和下一步动作。' }] },
    { stepNo: 5, shortTitle: '纯化选择', status: 'locked', attemptCount: 0, decision: null, totalScore: null, scores: null, missingLabels: [], issues: [] },
    { stepNo: 6, shortTitle: '蛋白纯化', status: 'locked', attemptCount: 0, decision: null, totalScore: null, scores: null, missingLabels: [], issues: [] },
    { stepNo: 7, shortTitle: '纯度验证', status: 'locked', attemptCount: 0, decision: null, totalScore: null, scores: null, missingLabels: [], issues: [] },
    { stepNo: 8, shortTitle: '浓度与回顾', status: 'locked', attemptCount: 0, decision: null, totalScore: null, scores: null, missingLabels: [], issues: [] },
  ],
  weakest: [{ label: '关键参数遗漏', count: 3 }, { label: '模糊表述', count: 2 }],
  latestFeedback: '整体流程方向正确，但超声破碎与电泳条件缺少关键参数，请补充后重新提交。',
};

function barColor(score: number): string {
  if (score >= 90) return 'bg-success';
  if (score >= 85) return 'bg-primary';
  return 'bg-warning';
}

function toPercent(score: number, max: number): number {
  return Math.round((Math.max(0, Math.min(score, max)) / max) * 100);
}

function levelName(percent: number): string {
  if (percent >= 85) return '优势';
  if (percent >= 70) return '基本稳定';
  return '优先提升';
}

const RADAR_CENTER = { x: 140, y: 115 } as const;
const RADAR_LABEL_POSITIONS: Array<{ x: number; y: number; textAnchor: 'start' | 'middle' }> = [
  { x: 140, y: 11, textAnchor: 'middle' },
  { x: 226, y: 70, textAnchor: 'start' },
  { x: 210, y: 210, textAnchor: 'middle' },
  { x: 70, y: 210, textAnchor: 'middle' },
  { x: 4, y: 70, textAnchor: 'start' },
];

function radarPoints(values: number[], radius: number): string {
  return values.map((value, index) => {
    const angle = (Math.PI * 2 * index) / values.length - Math.PI / 2;
    const r = (radius * Math.max(Math.min(value, 100), 0)) / 100;
    return `${(RADAR_CENTER.x + r * Math.cos(angle)).toFixed(1)},${(RADAR_CENTER.y + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

export default function StudyReport({ name, sessionId, preview, markdown, markdownBusy, markdownError, syncNotice = '', onClose, standalone = false, practiceMode = false, canSwitchToTeacher = false }: Props) {
  const [data, setData] = useState<StudentReportData | null>(null);
  const [error, setError] = useState('');
  const [grade, setGrade] = useState<GradeData | null>(preview ? { id: 'preview-grade', process_score: 86, contribution_points: 8.6, status: 'provisional', review: null } : null);
  const [appealReason, setAppealReason] = useState('');
  const [appealBusy, setAppealBusy] = useState(false);
  const [appealNotice, setAppealNotice] = useState('');

  useEffect(() => {
    if (preview) { setData(PREVIEW_REPORT_DATA); return; }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/student/report-data', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const payload = await response.json() as ApiResult<StudentReportData>;
        if (!payload.ok) throw new Error(payload.error.message);
        if (!cancelled) setData(payload.data);
      } catch (reason) {
        if (!cancelled) setError(clientErrorMessage(reason, '报告数据加载失败'));
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, preview]);

  useEffect(() => {
    if (preview || practiceMode) return;
    let cancelled = false;
    void fetch(`/api/student/grade?sessionId=${encodeURIComponent(sessionId)}`)
      .then((response) => response.json() as Promise<ApiResult<GradeData>>)
      .then((payload) => { if (!cancelled && payload.ok) setGrade(payload.data); })
      .catch(() => { /* 成绩服务不影响学习报告主体。 */ });
    return () => { cancelled = true; };
  }, [practiceMode, preview, sessionId]);

  async function submitAppeal() {
    const reason = appealReason.trim();
    if (!grade || reason.length < 10 || appealBusy || preview) return;
    setAppealBusy(true); setAppealNotice('');
    try {
      const response = await fetch('/api/student/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeId: grade.id, reason }),
      });
      const payload = await response.json() as ApiResult<{ id: string; status: string; reason: string; resolution: string | null }>;
      if (!payload.ok) throw new Error(payload.error.message);
      setGrade({ ...grade, status: 'appealed', review: payload.data });
      setAppealReason(''); setAppealNotice('复核申请已提交，教师结论将作为最终认定依据。');
    } catch (reasonValue) {
      setAppealNotice(reasonValue instanceof Error ? reasonValue.message : '复核申请提交失败。');
    } finally { setAppealBusy(false); }
  }

  function exportReport() {
    if (!data) return;
    const lines: string[] = [
      `${name} · 文字实验学习报告`,
      '重组蛋白表达与纯化 · 八步文字推演',
      '',
      `总分：${data.totalScore ?? '尚未评定'}（${data.grade}）`,
      '',
      '维度得分：' + DIMENSIONS.map(({ key, label, max }) => `${label} ${data.dimensions?.[key] ?? '—'}/${max}`).join('，'),
      '',
      '八步 Gate 记录：',
      ...data.steps.map((step) => `Gate ${step.stepNo} · ${step.shortTitle}：${step.status === 'passed' ? `通过（${step.attemptCount || 1} 次）` : step.status === 'teacher_review' || step.status === 'active' ? '待修改' : '未开始'}${step.totalScore != null ? `，${step.totalScore} 分` : ''}${step.missingLabels.length ? `，待改进：${step.missingLabels.join('；')}` : ''}`),
    ];
    if (data.weakest.length) lines.push('', '弱项：' + data.weakest.map((item) => `${item.label} ×${item.count}`).join('，'));
    if (data.latestFeedback) lines.push('', `AI 评价：${data.latestFeedback}`);
    if (grade) lines.push('', `过程成绩：${Number(grade.process_score).toFixed(1)}/100，计入课程总评 ${Number(grade.contribution_points).toFixed(1)}/10`);
    if (markdown) lines.push('', 'AI 综合总结：', markdown);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name}-文字实验学习报告.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const dims = data?.dimensions || null;
  const radarValues = DIMENSIONS.map(({ key, max }) => toPercent(dims?.[key] ?? 0, max));
  const pendingSteps = data?.steps.filter((step) => step.status !== 'passed' && step.status !== 'teacher_review') || [];
  const dimensionInsights = data && dims ? DIMENSIONS.map((dimension) => {
    const score = dims[dimension.key];
    const percent = toPercent(score, dimension.max);
    const relatedIssue = data.steps.map((step) => ({ step, issue: step.issues.find((issue) => issue.dimension === dimension.key) })).find((item) => item.issue);
    const evidence = relatedIssue
      ? `Gate ${relatedIssue.step.stepNo}「${relatedIssue.step.shortTitle}」：${relatedIssue.issue?.scenario || relatedIssue.issue?.label}${relatedIssue.issue?.quote ? `；原文“${relatedIssue.issue.quote}”` : ''}`
      : '当前已评阅步骤中暂无该维度的具体待改进项。';
    const action = relatedIssue
      ? relatedIssue.issue?.action || `回到 Gate ${relatedIssue.step.stepNo}，围绕“${relatedIssue.issue?.label}”补写条件／依据、判断与后续动作。`
      : `继续在相关步骤中使用“条件／依据 → 判断 → 后续动作”三段式，并保留能支持判断的文字证据。`;
    return {
      ...dimension, score, percent, evidence, action,
      impact: relatedIssue?.issue?.impact || '暂无足够证据判断该问题对后续步骤的具体影响。',
      causeBoundary: relatedIssue?.issue?.causeBoundary || '暂无足够证据推导成因，不对学习习惯作推测。',
      check: relatedIssue?.issue?.check || '下一次提交应包含可核对的条件、依据、判断与后续动作。',
    };
  }) : [];
  const swipeDismiss = useSwipeDismiss(onClose);

  return (
    <div className={standalone ? 'report-page-shell watercolor-student-report min-h-screen' : 'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4'}>
      {standalone && <StudentTopbar title="学习报告" subtitle="八步证据与五维能力" onBack={onClose} backLabel="实验地图" reportActive showTeacherSwitch={canSwitchToTeacher} />}
      {!standalone && <button type="button" aria-label="关闭学习报告" onClick={onClose} className="absolute inset-0 bg-foreground/40 cursor-default" />}
      <section className={standalone ? 'report-page-card relative w-[calc(100%_-_2rem)] max-w-5xl mx-auto my-5 rounded-3xl bg-card/92 border border-border shadow-card p-5 sm:p-8' : 'report-sheet relative w-full max-w-3xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-card border border-border shadow-dialog p-5 sm:p-8'}>
        {!standalone && <button type="button" aria-label="向下滑动关闭学习报告" className="sheet-swipe-handle" {...swipeDismiss}><span /></button>}
        <div className="flex items-start gap-2">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <span className="w-14 h-14 shrink-0 rounded-2xl bg-primary-container text-primary flex items-center justify-center text-xl font-black">{name.charAt(0)}</span>
            <div className="min-w-0">
              <h3 className="text-xl font-extrabold flex items-center gap-2">{name} · 文字实验学习报告</h3>
              <p className="text-sm text-muted-foreground mt-0.5">重组蛋白表达与纯化 · 八步文字推演</p>
            </div>
          </div>
          {!standalone && <button type="button" aria-label="关闭学习报告" onClick={onClose} className="w-11 h-11 shrink-0 rounded-xl border border-border bg-card hover:bg-muted transition-colors cursor-pointer inline-flex items-center justify-center"><X className="w-4 h-4" /></button>}
        </div>

        {!data && !error && <p className="mt-6 text-sm text-muted-foreground font-bold inline-flex items-center gap-2"><LoaderCircle className="w-4 h-4 animate-spin" />正在整理学习记录…</p>}
        {error && <p className="mt-6 text-sm font-bold text-destructive flex items-center gap-1.5"><CircleAlert className="w-4 h-4" />{error}</p>}

        {data && (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-4xl font-black text-primary">{data.totalScore ?? '—'}</p>
                  <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-primary-container text-primary text-xs font-bold">{data.grade}</span>
                </div>
                <button type="button" onClick={exportReport} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border text-sm font-bold hover:bg-muted transition-colors cursor-pointer"><Download className="w-4 h-4" /> 导出报告</button>
              </div>
              <p className="max-w-sm text-xs leading-5 text-muted-foreground">报告只基于已提交的文字、Gate 与 AI 评阅记录；未评阅的步骤不会被推断为能力不足。</p>
              {syncNotice && <p className="mt-2 max-w-sm text-xs font-bold leading-5 text-primary inline-flex items-start gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />{syncNotice}</p>}
            </div>

            <section className="grade-summary-panel mt-5" aria-labelledby="grade-summary-title">
              <div>
                <p id="grade-summary-title" className="text-sm font-extrabold">课程过程成绩 · 占总评10%</p>
                {practiceMode ? (
                  <p className="mt-1 text-xs text-muted-foreground">教师独立体验不会生成正式成绩，也不会同步到超星。</p>
                ) : grade ? (
                  <p className="mt-1 text-xs text-muted-foreground">八步最终Gate等权计算：过程分 <b>{Number(grade.process_score).toFixed(1)}/100</b>，课程贡献 <b>{Number(grade.contribution_points).toFixed(1)}/10</b>。</p>
                ) : <p className="mt-1 text-xs text-muted-foreground">完成评阅后自动计算，未完成步骤在成绩关闭时按0分计入。</p>}
              </div>
              {grade && !practiceMode && (
                <span className={`grade-state grade-state-${grade.status}`}>{grade.status === 'final' ? '教师已认定' : grade.status === 'appealed' ? '复核中' : grade.status === 'review_required' ? '需教师复核' : 'AI暂定'}</span>
              )}
              {grade && !practiceMode && grade.status !== 'final' && grade.status !== 'appealed' && (
                <div className="grade-appeal-form">
                  <label htmlFor="grade-appeal">对成绩有异议？说明具体步骤、记录或评分依据</label>
                  <textarea id="grade-appeal" value={appealReason} onChange={(event) => setAppealReason(event.target.value)} rows={3} placeholder="至少10个字，例如：Gate 4 最终版本已补充超声参数，但报告仍沿用了上一版评分。" />
                  <button type="button" disabled={preview || appealBusy || appealReason.trim().length < 10} onClick={() => void submitAppeal()}>{appealBusy ? '正在提交…' : '申请教师复核'}</button>
                </div>
              )}
              {grade?.review && <p className="grade-review-result"><b>复核记录：</b>{grade.review.resolution || grade.review.reason}</p>}
              {appealNotice && <p className="grade-review-result" role="status">{appealNotice}</p>}
            </section>

            <div className="mt-6 grid lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-border/60 shadow-card p-5">
                <h4 className="font-extrabold flex items-center gap-2 text-sm"><RadarIcon className="w-5 h-5 text-primary" /> 五维能力雷达</h4>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">雷达半径展示各维度的得分率（实际得分 ÷ 该维度满分），不是额外考试分数。面积越外侧，说明已评阅文字中该能力证据越充分。</p>
                {dims ? (
                  <div className="mt-3 flex justify-center">
                    <svg viewBox="0 0 280 240" className="w-full max-w-[360px]" role="img" aria-label="五维能力得分雷达图">
                      <g fill="none" stroke="currentColor" className="text-border" strokeWidth="1">
                        {[72, 48, 24].map((radius) => <polygon key={radius} points={radarPoints([100, 100, 100, 100, 100], radius)} />)}
                        {radarPoints([100, 100, 100, 100, 100], 72).split(' ').map((point, index) => {
                          const [x, y] = point.split(',');
                          return <line key={index} x1={RADAR_CENTER.x} y1={RADAR_CENTER.y} x2={x} y2={y} />;
                        })}
                      </g>
                      <g className="text-primary">
                        <polygon points={radarPoints(radarValues, 72)} fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2" />
                        {radarValues.map((value, index) => {
                          const angle = (Math.PI * 2 * index) / radarValues.length - Math.PI / 2;
                          const r = (72 * value) / 100;
                          return <circle key={index} cx={RADAR_CENTER.x + r * Math.cos(angle)} cy={RADAR_CENTER.y + r * Math.sin(angle)} r="3" fill="currentColor" />;
                        })}
                      </g>
                      <g fill="currentColor" className="text-muted-foreground" fontSize="10" fontWeight="700">
                        {DIMENSIONS.map(({ key, label }, index) => {
                          const { x, y, textAnchor } = RADAR_LABEL_POSITIONS[index];
                          const dimension = DIMENSIONS[index];
                          return (
                            <text key={key} x={x} y={y} textAnchor={textAnchor}>
                              <tspan x={x}>{label}</tspan>
                              <tspan x={x} dy="12" fontSize="8.5" fontWeight="600">{dims[key]}/{dimension.max}</tspan>
                            </text>
                          );
                        })}
                      </g>
                    </svg>
                  </div>
                ) : <p className="mt-4 text-xs text-muted-foreground">还没有产生五维评分记录。</p>}
              </div>
              <div className="rounded-2xl border border-border/60 shadow-card p-5 space-y-4">
                <h4 className="font-extrabold flex items-center gap-2 text-sm"><ChartNoAxesColumn className="w-5 h-5 text-secondary" /> 雷达图怎么读</h4>
                {dims ? DIMENSIONS.map(({ key, label, max, definition, standard }) => {
                  const percent = toPercent(dims[key], max);
                  return (
                  <div key={key}>
                    <div className="flex justify-between gap-2 text-xs font-bold"><span>{label} <span className="text-muted-foreground font-medium">{dims[key]}/{max}</span></span><span className="text-primary">{percent}%</span></div>
                    <div className="mt-1 h-2 rounded-full bg-surface-container-high overflow-hidden"><div className={`h-full rounded-full ${barColor(percent)}`} style={{ width: `${percent}%` }} /></div>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{definition} {standard}</p>
                  </div>
                );
                }) : <p className="text-xs text-muted-foreground">完成步骤评阅后这里会展示各维度得分。</p>}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border/60 shadow-card p-5">
              <h4 className="font-extrabold flex items-center gap-2 text-sm"><BadgeCheck className="w-5 h-5 text-success" /> 八步 Gate 记录</h4>
              <ol className="mt-4 space-y-3">
                {data.steps.map((step, index) => {
                  const isLast = index === data.steps.length - 1;
                  const passed = step.status === 'passed';
                  const active = step.status === 'teacher_review' || step.status === 'active';
                  return (
                    <li key={step.stepNo} className="flex gap-3">
                      <span className="flex flex-col items-center">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${passed ? 'bg-success text-primary-foreground' : active ? 'bg-warning text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          {passed ? <Check className="w-4 h-4" /> : active ? <Clock className="w-4 h-4" /> : <span className="text-xs font-bold">{step.stepNo}</span>}
                        </span>
                        {!isLast && <span className={`w-0.5 flex-1 ${passed ? 'bg-success/30' : 'bg-border'}`} />}
                      </span>
                      <div className="pb-1 min-w-0">
                        <p className="text-sm font-bold">
                          Gate {step.stepNo} · {step.shortTitle}
                          {passed && <span className="ml-2 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-bold">通过 · {step.attemptCount || 1} 次</span>}
                          {active && <span className="ml-2 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-xs font-bold">待修改 · 当前</span>}
                          {!passed && !active && <span className="ml-2 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-bold">未开始</span>}
                          {step.totalScore != null && <span className="ml-2 text-xs text-muted-foreground font-medium">{step.totalScore} 分</span>}
                        </p>
                        {step.missingLabels.length > 0 && <p className="text-xs text-muted-foreground mt-1">待改进：{step.missingLabels.join('；')}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {pendingSteps.length > 0 && <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5"><Hourglass className="w-3.5 h-3.5" /> Gate {pendingSteps.map((step) => step.stepNo).join('、')} 待完成。</p>}
            </div>

            {dimensionInsights.length > 0 && (
              <div className="mt-6 rounded-2xl border border-border/60 shadow-card p-5">
                <h4 className="font-extrabold flex items-center gap-2 text-sm"><ScanSearch className="w-5 h-5 text-secondary" /> 五维问题分析与提升方案</h4>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">每项先呈现评分依据，再列出已有记录中的具体场景；没有证据的维度不作负面推断。</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {dimensionInsights.map((item) => (
                    <article key={item.key} className="rounded-xl border border-border bg-card/70 p-4">
                      <div className="flex items-center justify-between gap-3"><h5 className="text-sm font-bold">{item.label}</h5><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${item.percent >= 85 ? 'bg-success/10 text-success' : item.percent >= 70 ? 'bg-primary-container text-primary' : 'bg-warning/10 text-warning'}`}>{levelName(item.percent)} · {item.score}/{item.max}</span></div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground"><b>定义：</b>{item.definition}</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground"><b>学习场景：</b>{item.evidence}</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground"><b>问题影响：</b>{item.impact}</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground"><b>成因边界：</b>{item.causeBoundary}</p>
                      <p className="mt-2 text-xs leading-5 text-primary"><b>下一步动作：</b>{item.action}</p>
                      <p className="mt-2 text-xs leading-5 text-primary"><b>检查标准：</b>{item.check}</p>
                    </article>
                  ))}
                </div>
                {data.weakest.length > 0 && <p className="mt-4 text-xs leading-5 text-muted-foreground"><b>跨步骤重复出现：</b>{data.weakest.map((item) => `${item.label}（${item.count} 次）`).join('；')}。优先从出现次数最多的一项开始修订。</p>}
                {data.latestFeedback && <p className="mt-3 text-xs leading-relaxed flex gap-2"><Lightbulb className="w-4 h-4 text-warning shrink-0 mt-0.5" /><span><b>最近一次评阅：</b>{data.latestFeedback}</span></p>}
              </div>
            )}

            <div className="mt-6">
              <h4 className="font-extrabold flex items-center gap-2 text-sm"><FileText className="w-5 h-5 text-primary" /> 完整学习报告</h4>
              {markdownBusy && <p className="mt-3 text-sm text-muted-foreground font-bold inline-flex items-center gap-2"><LoaderCircle className="w-4 h-4 animate-spin" />正在生成学习报告…</p>}
              {markdownError && <p className="mt-3 text-sm font-bold text-destructive flex items-center gap-1.5"><CircleAlert className="w-4 h-4" />{markdownError}</p>}
              {markdown && !markdownBusy && !markdownError && <div className="mt-3 rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap">{markdown}</div>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
