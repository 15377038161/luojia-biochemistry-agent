'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, GripHorizontal, History, LoaderCircle, MessageCircle, Minimize2, Send, Sparkles } from 'lucide-react';
import type { AgentMessage, ApiResult, ExperimentStep } from '@/domain/agent';
import { clientErrorMessage } from '@/lib/client-request';

interface Props {
  sessionId: string;
  step: ExperimentStep;
  mode: 'task' | 'review';
  messages?: AgentMessage[];
  preview?: boolean;
}

const QUICK_TASK = ['这一步的核心目标是什么？', '帮我梳理原理，不要直接给答案', '我应该重点观察哪些条件？'];
const QUICK_REVIEW = ['这次点评最需要先改什么？', '解释一下扣分依据', '如何检查修订是否完整？'];

export default function GlobalAiTutor({ sessionId, step, mode, messages = [], preview = false }: Props) {
  const initialHistory = useMemo(() => messages.filter((message) => message.kind === 'question').slice(-12), [messages]);
  const [history, setHistory] = useState<AgentMessage[]>(initialHistory);
  const [question, setQuestion] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => { setHistory(initialHistory); }, [initialHistory]);

  useEffect(() => {
    function move(event: PointerEvent) {
      if (!dragRef.current) return;
      const nextX = dragRef.current.ox + event.clientX - dragRef.current.x;
      const nextY = dragRef.current.oy + event.clientY - dragRef.current.y;
      const tutorWidth = open ? Math.min(390, window.innerWidth - 28) : 148;
      const tutorHeight = open ? Math.min(570, window.innerHeight - 112) : 62;
      const maxX = Math.max(0, window.innerWidth - tutorWidth - 28);
      const maxY = Math.max(0, window.innerHeight - tutorHeight - 28);
      setOffset({ x: Math.max(-maxX, Math.min(0, nextX)), y: Math.max(-maxY, Math.min(0, nextY)) });
    }
    function stop() { dragRef.current = null; }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
  }, [open]);

  async function ask(contentValue = question) {
    const content = contentValue.trim();
    if (content.length < 2 || busy) return;
    setBusy(true); setError('');
    const now = new Date().toISOString();
    const optimistic: AgentMessage = { id: `local-${Date.now()}`, role: 'user', kind: 'question', stepId: step.id, content, createdAt: now };
    setHistory((current) => [...current, optimistic].slice(-12));
    setQuestion('');
    if (preview) {
      const reply: AgentMessage = {
        id: `preview-${Date.now()}`, role: 'assistant', kind: 'question', stepId: step.id, createdAt: now,
        content: mode === 'review'
          ? `先处理“${step.keyPoints[0].label}”：对照点评里的原文证据，再补齐条件、理由和判断标准。`
          : `先想一想“${step.keyPoints[0].hints[0]}”。把你的判断告诉我，我会继续追问，但不会替你作答。`,
      };
      setHistory((current) => [...current, reply].slice(-12)); setBusy(false); return;
    }
    try {
      const response = await fetch('/api/student/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, content, learningStage: mode }),
      });
      const payload = await response.json() as ApiResult<AgentMessage[]>;
      if (!payload.ok) throw new Error(payload.error.message);
      setHistory((current) => [...current, ...payload.data.filter((message) => message.role === 'assistant')].slice(-12));
    } catch (reason) { setError(clientErrorMessage(reason, 'AI 助教暂时无法回答')); }
    finally { setBusy(false); }
  }

  const quickQuestions = mode === 'review' ? QUICK_REVIEW : QUICK_TASK;
  return <div className={`global-tutor ${open ? 'is-open' : ''}`} style={{ transform: `translate3d(${offset.x}px,${offset.y}px,0)` }}>
    {open ? <section className="global-tutor-window" aria-label="AI 助教小珞">
      <header onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button')) return; dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; }}>
        <span><Bot /></span><div><small>AI TUTOR</small><b>小珞 · 本步学习助教</b></div><GripHorizontal className="tutor-drag-hint" />
        <button type="button" onClick={() => setOpen(false)} aria-label="收起 AI 助教"><Minimize2 /></button>
      </header>
      <div className="global-tutor-context"><Sparkles /><span>Gate {step.id} · {step.shortTitle}</span><small>{mode === 'review' ? '可结合点评继续追问' : '只给思路与追问，不直接代答'}</small></div>
      <div className="global-tutor-quick">{quickQuestions.map((item) => <button key={item} type="button" disabled={busy} onClick={() => void ask(item)}>{item}</button>)}</div>
      <div className="global-tutor-history" aria-live="polite">
        {history.length === 0 && <div className="global-tutor-empty"><History /><p>还没有对话。可以点上方快捷问题，或输入自己的困惑。</p></div>}
        {history.map((message) => <article key={message.id} className={message.role === 'user' ? 'is-user' : 'is-assistant'}><b>{message.role === 'user' ? '我' : '小珞'}</b><p>{message.content}</p></article>)}
        {busy && <div className="global-tutor-thinking"><LoaderCircle className="spin" />小珞正在整理思路…</div>}
      </div>
      {error && <p className="global-tutor-error">{error}</p>}
      <form onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} maxLength={4000} placeholder="输入问题，Enter 发送…" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(); } }} />
        <button type="submit" disabled={busy || question.trim().length < 2} aria-label="发送问题">{busy ? <LoaderCircle className="spin" /> : <Send />}</button>
      </form>
    </section> : <button type="button" className="global-tutor-launcher" onClick={() => setOpen(true)} aria-label="打开 AI 助教"><span><MessageCircle /></span><b>AI 助教</b><small>随时提问</small></button>}
  </div>;
}
