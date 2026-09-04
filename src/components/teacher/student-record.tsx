'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpenText, Clock3, FileSearch, LoaderCircle, Radar, UserRound } from 'lucide-react';
import type { ApiResult } from '@/domain/agent';
import type { TeacherStudentRecord } from '@/app/api/teacher/student/route';
import { experimentSteps } from '@/domain/experiment';

type Tab = 'overview' | 'answers' | 'evidence' | 'report' | 'timeline';
const tabs: Array<[Tab, string]> = [['overview', '总览'], ['answers', '八步回答'], ['evidence', '评测证据'], ['report', '报告雷达'], ['timeline', '时间线']];
const PREVIEW_RECORD: TeacherStudentRecord = {
  session: { id: 'preview-1', current_step: 5 }, profile: { display_name: '张明轩', student_no: '2023302110041', major_name: '生物技术', grade_name: '2023级', class_name: '生物技术1班' },
  experimentProfile: { target_gene: 'EGFP', sequence_source: 'recommended', accession: null, cloning_strategy: 'recombination' },
  attempts: [{ id: 'pa1', step_no: 4, version_no: 1, answer: '取菌液离心收集，重悬后超声破碎，跑胶判断表达。', submitted_at: '2026-09-04T08:00:00Z' }],
  evaluations: [{ id: 'pe1', attempt_id: 'pa1', decision: 'revise', total_score: 64, result: { studentFeedback: '流程方向正确，但缺少超声功率、间隔、总时长以及上清/沉淀等量比较。', reasoningReview: '从“超声破碎”直接跳到“跑胶”，没有说明可溶性判断证据链。', detailedIssues: [{ title: '裂解参数缺失', evidence: { quote: '重悬后超声破碎' }, impact: '处理强度不可复核，可能造成蛋白降解或裂解不足。', action: '补充低温、功率、工作/间隔时间和总时长。', check: '参数可从修订原文逐项定位。' }] } }],
  reports: [{ id: 'pr1', version: 1, content: { grading: { radar_dimensions: [{ key: 'knowledgeMastery', label: '知识点掌握', score: 78 }, { key: 'operationUnderstanding', label: '实验操作理解', score: 64 }, { key: 'dataInterpretation', label: '数据解读', score: 68 }, { key: 'detailControl', label: '细节把控', score: 58 }, { key: 'knowledgeTransfer', label: '知识迁移应用', score: 70 }] } }, rendered_markdown: '## 阶段学习结论\n已理解SDS-PAGE基本目的，但实验参数记录与上清/沉淀证据链仍需补齐。' }],
  timeline: [{ id: 'pt1', kind: 'step_answer', content: '提交步骤4第一版文字推演。', created_at: '2026-09-04T08:00:00Z' }],
};

function text(value: unknown, fallback = '—'): string { return typeof value === 'string' && value.trim() ? value : fallback; }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function resultOf(row: Record<string, unknown>): Record<string, unknown> { return row.result && typeof row.result === 'object' ? row.result as Record<string, unknown> : {}; }

export default function StudentRecord({ sessionId, preview = false }: { sessionId: string; preview?: boolean }) {
  const [record, setRecord] = useState<TeacherStudentRecord | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  useEffect(() => {
    if (preview) { setRecord(PREVIEW_RECORD); return; }
    void fetch(`/api/teacher/student?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json() as ApiResult<TeacherStudentRecord>;
      if (!payload.ok) throw new Error(payload.error.message);
      setRecord(payload.data);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '加载学生档案失败'));
  }, [preview, sessionId]);
  const profile = record?.profile ?? {};
  const latestReport = record?.reports[0] ?? null;
  const latestEvaluations = useMemo(() => {
    const byStep = new Map<number, Record<string, unknown>>();
    for (const attempt of record?.attempts ?? []) {
      const found = record?.evaluations.find((item) => item.attempt_id === attempt.id);
      if (found) byStep.set(number(attempt.step_no), { ...found, attempt });
    }
    return [...byStep.entries()].sort(([a], [b]) => a - b);
  }, [record]);
  if (error) return <section className="teacher-work-panel"><p className="teacher-panel-message">{error}</p><Link href="/teacher/students" className="teacher-record-back"><ArrowLeft />返回学生管理</Link></section>;
  if (!record) return <section className="teacher-work-panel teacher-panel-loading"><LoaderCircle className="animate-spin" />正在读取授权范围内的完整档案…</section>;
  const experimentProfile = record.experimentProfile ?? {};
  const scores = latestEvaluations.map(([, item]) => number(item.total_score));
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
  const reportContent = latestReport?.content && typeof latestReport.content === 'object' ? latestReport.content as Record<string, unknown> : {};
  const grading = reportContent.grading && typeof reportContent.grading === 'object' ? reportContent.grading as Record<string, unknown> : {};
  const radar = Array.isArray(grading.radar_dimensions) ? grading.radar_dimensions as Array<Record<string, unknown>> : [];
  return <section className="teacher-student-record">
    <div className="teacher-record-hero"><Link href="/teacher/students" className="teacher-record-back"><ArrowLeft />学生列表</Link><div><span>{text(profile.display_name, '未命名学生').charAt(0)}</span><div><small>{text(profile.student_no)}</small><h2>{text(profile.display_name, '未命名学生')}</h2><p>{text(profile.major_name)} · {text(profile.grade_name)} · {text(profile.class_name)}</p></div></div><strong>{average}<small>已评步骤均分</small></strong></div>
    <nav className="teacher-record-tabs" aria-label="学生档案分栏">{tabs.map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === 'overview' && <div className="teacher-record-grid"><article><UserRound /><h3>实验档案</h3><p>目标基因：{text(experimentProfile.target_gene, 'EGFP（默认）')}</p><p>序列来源：{text(experimentProfile.sequence_source)}</p><p>登录号：{text(experimentProfile.accession)}</p><p>克隆策略：{text(experimentProfile.cloning_strategy, 'recombination')}</p></article><article><BookOpenText /><h3>学习进度</h3><p>当前步骤：{number(record.session.current_step) || 1} / 8</p><p>已提交：{new Set(record.attempts.map((item) => item.step_no)).size} 步</p><p>报告版本：{record.reports.length}</p><p>评测记录：{record.evaluations.length}</p></article></div>}
    {tab === 'answers' && <div className="teacher-record-stack">{experimentSteps.map((step) => { const attempts = record.attempts.filter((item) => number(item.step_no) === step.id); return <article key={step.id}><header><span>{step.id}</span><h3>{step.shortTitle}</h3><small>{attempts.length} 次提交</small></header>{attempts.length ? attempts.map((item) => <div key={String(item.id)}><b>第 {number(item.version_no)} 版</b><p>{text(item.answer)}</p></div>) : <p className="teacher-record-empty">尚未作答</p>}</article>; })}</div>}
    {tab === 'evidence' && <div className="teacher-record-stack">{latestEvaluations.map(([stepNo, item]) => { const result = resultOf(item); const issues = Array.isArray(result.detailedIssues) ? result.detailedIssues as Array<Record<string, unknown>> : []; return <article key={stepNo}><header><span>{stepNo}</span><h3>{experimentSteps[stepNo - 1]?.shortTitle}</h3><small>{number(item.total_score)} 分 · {text(item.decision)}</small></header><p><b>学生反馈：</b>{text(result.studentFeedback)}</p><p><b>推理复核：</b>{text(result.reasoningReview)}</p>{issues.map((issue, index) => <div key={index} className="teacher-evidence-issue"><b>{text(issue.title, '待改进项')}</b><p>证据：{text((issue.evidence as Record<string, unknown> | undefined)?.quote, '未交代')}</p><p>影响：{text(issue.impact)}</p><p>行动：{text(issue.action)}；验收：{text(issue.check)}</p></div>)}</article>; })}</div>}
    {tab === 'report' && <div className="teacher-record-grid"><article><Radar /><h3>五维能力（0–100）</h3>{radar.length ? radar.map((item) => <div key={text(item.key)} className="teacher-record-score"><span>{text(item.label)}</span><i><em style={{ width: `${Math.min(number(item.score), 100)}%` }} /></i><b>{number(item.score)}</b></div>) : <p>尚未生成包含五维数据的报告。</p>}</article><article><FileSearch /><h3>最新报告 V{number(latestReport?.version)}</h3><p className="whitespace-pre-wrap">{text(latestReport?.rendered_markdown, '尚未生成学习报告。')}</p></article></div>}
    {tab === 'timeline' && <div className="teacher-record-stack">{record.timeline.map((item) => <article key={String(item.id)}><header><Clock3 /><h3>{text(item.kind)}</h3><small>{text(item.created_at)}</small></header><p>{text(item.content)}</p></article>)}</div>}
  </section>;
}
