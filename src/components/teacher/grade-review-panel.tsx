'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, RefreshCw, Scale, TriangleAlert } from 'lucide-react';
import { clientErrorMessage } from '@/lib/client-request';
import Link from 'next/link';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

interface ReviewView {
  id: string;
  sessionId: string;
  status: string;
  reason: string;
  resolution: string;
  createdAt: string;
  studentName: string;
  studentNo: string;
  processScore: number;
  contributionPoints: number;
}

interface Props { preview?: boolean }

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalize(value: unknown): ReviewView[] {
  if (!Array.isArray(value)) return [];
  // 正式模型：申诉来自 agent_messages（kind='grade_review_request'），
  // 成绩由统一成绩模块计算后随列表返回。
  return value.map((entry) => {
    const source = asRecord(entry);
    return {
      id: String(source.requestId ?? ''), sessionId: String(source.sessionId ?? ''), status: String(source.status ?? 'pending'), reason: String(source.reason ?? ''),
      resolution: String(source.resolution ?? ''), createdAt: String(source.createdAt ?? source.created_at ?? ''),
      studentName: String(source.studentName ?? '未命名学生'), studentNo: String(source.studentNo ?? '—'),
      processScore: asNumber(source.processScore), contributionPoints: asNumber(source.contributionPoints),
    };
  }).filter((item) => item.id);
}

const PREVIEW_REVIEWS: ReviewView[] = [{
  id: 'preview-review', sessionId: 'preview-1', status: 'pending', reason: '步骤 4 的案例图判断已补充证据，希望教师复核最终过程成绩。',
  resolution: '', createdAt: '2026-08-23T08:20:00.000Z', studentName: '张明轩', studentNo: '2023302110041',
  processScore: 72.5, contributionPoints: 7.25,
}];

export default function GradeReviewPanel({ preview = false }: Props) {
  const [reviews, setReviews] = useState<ReviewView[]>(preview ? PREVIEW_REVIEWS : []);
  const [selectedId, setSelectedId] = useState(preview ? PREVIEW_REVIEWS[0].id : '');
  const [resolution, setResolution] = useState('');
  const [overrideScore, setOverrideScore] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);

  async function load() {
    if (preview) { setReviews(PREVIEW_REVIEWS); return; }
    try {
      const response = await fetch('/api/teacher/grade-reviews', { cache: 'no-store' });
      const payload = await response.json() as { ok?: boolean; data?: unknown; error?: { message?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || '加载成绩异议失败');
      const next = normalize(payload.data);
      setReviews(next);
      setSelectedId((current) => current || next[0]?.id || '');
    } catch (reason) { setMessage(clientErrorMessage(reason, '加载成绩异议失败')); }
  }

  useEffect(() => { void load(); }, [preview]);
  const selected = reviews.find((item) => item.id === selectedId) ?? null;

  async function submit(accepted: boolean) {
    if (!selected || !resolution.trim() || busy) { setMessage('请先填写可追溯的复核结论。'); return; }
    setBusy(true); setMessage('');
    try {
      if (!preview) {
        const score = overrideScore.trim() ? Number(overrideScore) : null;
        const response = await fetch('/api/teacher/grade-reviews', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: selected.id, resolution: resolution.trim(), overrideScore: score, accepted }),
        });
        const payload = await response.json() as { ok?: boolean; error?: { message?: string } };
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message || '提交复核失败');
      }
      setReviews((current) => current.map((item) => item.id === selected.id ? { ...item, status: accepted ? 'accepted' : 'rejected', resolution: resolution.trim() } : item));
      setResolution(''); setOverrideScore(''); setMessage('复核结果已记录。');
    } catch (reason) { setMessage(clientErrorMessage(reason, '提交复核失败')); }
    finally { setBusy(false); }
  }

  return (
    <section id="grade-reviews" className="teacher-work-panel" aria-labelledby="grade-review-title">
      <div className="teacher-panel-heading"><div><p>成绩认定</p><h2 id="grade-review-title">过程成绩与异议复核</h2></div><button type="button" onClick={() => void load()} aria-label="刷新成绩异议"><RefreshCw aria-hidden /></button></div>
      <p className="teacher-panel-lead">八步最终有效 Gate 等权形成 100 分过程成绩，按 10% 折算课程贡献分；教师结论覆盖 AI 暂定分。</p>
      <div className="teacher-review-workspace">
        <div className="teacher-review-list">
          {reviews.length === 0 && <p><CheckCircle2 aria-hidden />当前没有成绩异议。</p>}
          {reviews.map((review) => (
            <button key={review.id} type="button" onClick={() => { setSelectedId(review.id); setResolution(''); setOverrideScore(''); setMessage(''); setOpen(true); }} className={review.id === selectedId ? 'is-selected' : ''}>
              <span><strong>{review.studentName}</strong><small>{review.studentNo}</small></span>
              <b>{review.processScore.toFixed(1)} 分</b><i data-status={review.status}>{review.status === 'pending' ? '待复核' : '已处理'}</i>
            </button>
          ))}
        </div>
        <Sheet open={open} onOpenChange={setOpen}><SheetContent className="w-full sm:max-w-xl overflow-y-auto"><SheetHeader className="mb-6 pr-12"><SheetTitle>成绩复核</SheetTitle><SheetDescription>保留原报告，复核结果生成新版本。</SheetDescription></SheetHeader><div className="teacher-review-form">
          {!selected ? <p className="teacher-panel-loading"><Scale aria-hidden />选择一条记录查看详情。</p> : (
            <>
              {selected.sessionId && <Link className="inline-flex min-h-11 items-center underline" href={`/teacher/students/${selected.sessionId}${preview ? '?preview=1' : ''}`}>查看学生完整学习档案</Link>}
              <div className="teacher-score-line"><span><small>过程成绩</small><strong>{selected.processScore.toFixed(1)}</strong></span><span><small>课程贡献</small><strong>{selected.contributionPoints.toFixed(2)} / 10</strong></span></div>
              <div className="teacher-review-reason"><b>学生异议说明</b><p>{selected.reason}</p></div>
              {selected.status === 'pending' ? (
                <>
                  <label>教师复核结论<textarea value={resolution} onChange={(event) => setResolution(event.target.value)} rows={4} placeholder="结合具体步骤、评阅证据和认定依据填写…" /></label>
                  <label>调整后的过程成绩（可选）<input type="number" min="0" max="100" step="0.1" value={overrideScore} onChange={(event) => setOverrideScore(event.target.value)} placeholder="不填写则保留原成绩" /></label>
                  <div className="teacher-review-actions"><button disabled={busy} type="button" onClick={() => void submit(!overrideScore.trim())}>{busy ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}{overrideScore.trim() ? '调整成绩并生成新版本' : '确认原成绩'}</button><button disabled={busy || !!overrideScore.trim()} type="button" onClick={() => void submit(false)}><TriangleAlert />保留成绩并回复异议</button></div>
                </>
              ) : <p className="teacher-review-resolved"><CheckCircle2 aria-hidden />{selected.resolution || '该异议已处理。'}</p>}
            </>
          )}
          {message && <p className="teacher-panel-message">{message}</p>}
        </div></SheetContent></Sheet>
      </div>
      {!open && message && <p role="status" className="teacher-panel-message">{message}</p>}
    </section>
  );
}
