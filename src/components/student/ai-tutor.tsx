'use client';

import { useState } from 'react';
import { Bot, LoaderCircle, Send, Sparkles } from 'lucide-react';
import type { AgentMessage, ApiResult, ExperimentStep } from '@/domain/agent';

interface Props {
  sessionId: string;
  step: ExperimentStep;
  mode: 'task' | 'review';
  preview?: boolean;
}

export default function AiTutor({ sessionId, step, mode, preview = false }: Props) {
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask() {
    const content = question.trim();
    if (content.length < 2 || busy) return;
    setBusy(true); setError('');
    if (preview) {
      setReply(mode === 'review'
        ? `可以。先对照“${step.keyPoints[0].label}”查看 AI 引用的原文证据，再按参考答案中的条件、理由和判断标准逐项修订。`
        : `先别急着找结论。想一想：${step.keyPoints[0].hints[0]} 你可以把自己的判断发给我，我再继续追问。`);
      setQuestion(''); setBusy(false); return;
    }
    try {
      const response = await fetch('/api/student/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, content, learningStage: mode }),
      });
      const payload = await response.json() as ApiResult<AgentMessage[]>;
      if (!payload.ok) throw new Error(payload.error.message);
      const answer = [...payload.data].reverse().find((message) => message.role === 'assistant');
      setReply(answer?.content || '暂时没有收到回复，请稍后再试。');
      setQuestion('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI 助教暂时无法回答');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl bg-card border border-primary/20 shadow-card p-5" aria-label="AI 助教">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-container text-primary"><Bot className="h-5 w-5" /></span>
        <div><p className="text-xs font-black tracking-[.12em] text-primary">AI 助教</p><h2 className="text-base font-extrabold">小珞 · 随时问我</h2></div>
        <Sparkles className="ml-auto h-4 w-4 text-secondary" />
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">{mode === 'task' ? '我会用追问和提示帮你理解原理，不直接代答。' : '点评后可以继续追问，我会结合本步报告解释问题和修订方向。'}</p>
      {reply && <div className="mt-3 rounded-2xl border border-primary/20 bg-primary-container/45 p-3 text-xs leading-6"><b className="text-primary">小珞：</b>{reply}</div>}
      <div className="mt-3 flex gap-2">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} placeholder="输入你的问题…"
          className="min-w-0 flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <button type="button" onClick={ask} disabled={busy || question.trim().length < 2} aria-label="发送给 AI 助教"
          className="self-end rounded-xl bg-primary p-2.5 text-primary-foreground disabled:opacity-40">
          {busy ? <LoaderCircle className="h-4 w-4 spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-bold text-destructive">{error}</p>}
    </section>
  );
}
