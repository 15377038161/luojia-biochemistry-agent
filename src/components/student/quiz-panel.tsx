"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenCheck, Check, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/domain/agent";
import type { QuizHistory, QuizSession } from "@/lib/quiz-contract";

async function request<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const result = await response.json() as ApiResult<T>;
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
type Props = { stepNo: number; preview?: boolean; initialId?: string; onCompleted?: () => void; onContinue?: () => void };
export default function QuizPanel({ stepNo, preview = false, initialId, onCompleted, onContinue }: Props) {
  const [session, setSession] = useState<QuizSession | null>(null);
  const [history, setHistory] = useState<QuizHistory>({ items: [], nextPage: null, activeId: null, hasCompleted: false });
  const [index, setIndex] = useState(0);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState("");
  const [retry, setRetry] = useState(0);
  const completion = useRef(onCompleted);
  completion.current = onCompleted;
  const isReview = session?.status === "graded";
  const canContinue = history.hasCompleted || isReview;

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      setLoading(true); setError("");
      try {
        if (preview) {
          const saved = sessionStorage.getItem("quiz-preview-" + stepNo);
          if (saved && !cancelled) {
            const restored = JSON.parse(saved) as QuizSession;
            setSession(restored);
            if (restored.status === "graded") completion.current?.();
          }
          return;
        }
        const data = await request<QuizHistory>("/api/student/quiz/history?stepNo=" + stepNo);
        const id = initialId || data.activeId || data.items[0]?.session_id;
        const restored = id ? await request<QuizSession>("/api/student/quiz/session?session_id=" + encodeURIComponent(id)) : null;
        if (cancelled) return;
        setHistory(data); setSession(restored);
        setIndex(restored?.status === "in_progress" ? Math.max(0, restored.questions.findIndex(q => !restored.answers[q.question_id])) : 0);
        if (data.hasCompleted || restored?.status === "graded") completion.current?.();
        setSaveState(restored?.status === "in_progress" ? "已恢复上次作答" : "");
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : "加载失败，请重试。"); }
      finally { if (!cancelled) setLoading(false); }
    }
    void restore();
    return () => { cancelled = true; };
  }, [stepNo, preview, initialId, retry]);

  async function openHistory(id: string) {
    if (!id || busy) return;
    setBusy(true); setError(""); setChecking(false);
    try {
      const data = await request<QuizSession>("/api/student/quiz/session?session_id=" + encodeURIComponent(id));
      setSession(data); setIndex(0); setSaveState("");
      if (data.status === "graded") completion.current?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "读取答卷失败"); }
    finally { setBusy(false); }
  }
  async function start() {
    setBusy(true); setError(""); setNotice("");
    try {
      let data: QuizSession;
      if (preview) {
        data = { session_id: "preview", status: "in_progress", answers: {}, results: null,
          questions: Array.from({ length: 5 }, (_, i) => ({ question_id: "preview-" + i,
            question_text: ["怎样记录实验方案，才能让他人复现？", "识别器材后，还需要说明哪些信息？", "分析条带变化时，应先核对什么？", "出现异常结果时，哪种处理更合理？", "解释关键参数时，怎样体现原理理解？"][i],
            options: [{ id: "A", text: "交代操作目的、条件、对照与判断依据" }, { id: "B", text: "仅记录实验名称" }, { id: "C", text: "只描述结果而省略条件" }, { id: "D", text: "使用笼统表述代替参数" }] })) };
      } else {
        const created = await request<{ session_id: string }>("/api/student/quiz/start", { stepNo });
        data = await request<QuizSession>("/api/student/quiz/session?session_id=" + created.session_id);
      }
      setSession(data); setHistory(value => ({ ...value, activeId: data.session_id })); setIndex(0); setChecking(false); setSaveState("请选择一个选项，作答会自动保存");
      if (preview) sessionStorage.setItem("quiz-preview-" + stepNo, JSON.stringify(data));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "抽题失败，请重试";
      if (message.includes("暂时没有更多新题")) setNotice(message); else setError(message);
    } finally { setBusy(false); }
  }
  async function save(answers: Record<string, string>) {
    if (!session) return;
    setBusy(true); setError(""); setSaveState("正在保存…");
    try {
      if (preview) sessionStorage.setItem("quiz-preview-" + stepNo, JSON.stringify({ ...session, answers }));
      else await request("/api/student/quiz/session", { session_id: session.session_id, answers }, "PATCH");
      setSaveState("已保存");
    } catch (reason) { setSaveState("保存失败"); setError(reason instanceof Error ? reason.message : "作答仍保留在当前页面，请重试保存"); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!session || busy) return;
    setBusy(true); setError("");
    try {
      let data: QuizSession;
      if (preview) {
        data = { ...session, status: "graded", results: session.questions.map(q => ({ question_id: q.question_id, user_answer: session.answers[q.question_id], correct_answer: "A", is_correct: session.answers[q.question_id] === "A", explanation: "复现实验需要完整记录操作目的、条件、对照与判断依据。此题为预览演示，正式题目使用课程审核后的解析。" })) };
        sessionStorage.setItem("quiz-preview-" + stepNo, JSON.stringify(data));
      } else {
        await request("/api/student/quiz/submit", { session_id: session.session_id, answers: session.answers });
        data = await request<QuizSession>("/api/student/quiz/session?session_id=" + session.session_id);
      }
      setSession(data); setHistory(value => ({ ...value, hasCompleted: true })); completion.current?.();
      setChecking(false); setIndex(0); setSaveState("答卷已提交");
      if (!preview) setHistory(await request<QuizHistory>("/api/student/quiz/history?stepNo=" + stepNo));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "提交失败，答案已保留"); }
    finally { setBusy(false); }
  }
  const question = session?.questions[index];
  const result = session?.results?.find(item => item.question_id === question?.question_id);
  const answered = session?.questions.filter(q => session.answers[q.question_id]).length || 0;
  return <section className="learning-paper quiz-workspace" aria-label="知识检验">
    <header className="learning-section-heading">
      <div><span className="learning-eyebrow">02 / KNOWLEDGE CHECK</span><h2>{isReview ? "回顾这一次思考" : "检验你的理解"}</h2><p>{isReview ? "答案、依据与误区，逐题回顾。已完成本环节，可以继续文字推演。" : "每次专注一道题。先独立作答，最终确认后再查看解析。"}</p></div>
      <BookOpenCheck aria-hidden className="section-mark" />
    </header>
    {loading && <p role="status" className="learning-empty"><LoaderCircle className="animate-spin" />正在恢复学习记录…</p>}
    {error && <div role="alert" className="learning-notice is-error">{error}<Button variant="outline" disabled={busy} onClick={() => session?.status === "in_progress" ? void save(session.answers) : setRetry(n => n + 1)}>重试</Button></div>}
    {notice && <p role="status" className="learning-notice">{notice}</p>}
    {!loading && <div className="quiz-toolbar">
      <span className="learning-status">{isReview ? "已完成 · 历史答卷" : session ? "独立作答" : "准备开始"}</span>
      {history.items.length > 0 && <label>历史答卷 <select aria-label="选择历史答卷" disabled={busy} value={isReview ? session?.session_id : ""} onChange={e => void openHistory(e.target.value)}>
        <option value="" disabled>选择一次答题</option>
        {history.items.map(item => <option key={item.session_id} value={item.session_id}>{new Date(item.created_at).toLocaleString("zh-CN")} · {item.correct}/{item.total} 题</option>)}
      </select></label>}
      {history.nextPage !== null && <Button variant="ghost" disabled={busy} onClick={async () => {
        setBusy(true);
        try { const more = await request<QuizHistory>("/api/student/quiz/history?stepNo=" + stepNo + "&page=" + history.nextPage); setHistory(h => ({ ...more, items: [...h.items, ...more.items] })); }
        catch (reason) { setError(reason instanceof Error ? reason.message : "读取失败"); } finally { setBusy(false); }
      }}>更早记录</Button>}
      {history.activeId && session?.session_id !== history.activeId && <Button variant="outline" disabled={busy} onClick={() => void openHistory(history.activeId!)}>继续未完成答卷</Button>}
      {isReview && <Button variant="outline" disabled={busy} onClick={() => void start()}><RotateCcw />练习新题</Button>}
    </div>}
    {!loading && !session && <div className="learning-empty"><p>用五道小题检查原理、操作细节与数据判断。</p><Button onClick={() => void start()} disabled={busy}>{busy ? "正在抽题…" : "开始知识检验"}</Button></div>}
    {session?.status === "submitted" && <p role="status" className="learning-notice">答卷已提交，批改结果尚未就绪。<Button variant="outline" onClick={() => setRetry(n => n + 1)}>刷新结果</Button></p>}
    {session && question && session.status !== "submitted" && <>
      <nav className="quiz-number-nav" aria-label="题目导航">{session.questions.map((q, i) => <button type="button" key={q.question_id} disabled={busy} aria-current={index === i && !checking ? "step" : undefined} className={session.answers[q.question_id] ? "is-answered" : ""} onClick={() => { setIndex(i); setChecking(false); }}>{i + 1}<span className="sr-only">{session.answers[q.question_id] ? "已作答" : "未作答"}</span></button>)}</nav>
      {checking ? <div className="quiz-question-card"><h3>检查答卷，再确认提交</h3><p>已填写 {answered} / {session.questions.length} 题。点击题号可以修改，提交后本次答卷锁定。</p>
        <ul className="quiz-check-list">{session.questions.map((q, i) => <li key={q.question_id}><button type="button" onClick={() => { setChecking(false); setIndex(i); }}><span>第 {i + 1} 题 · {q.question_text}</span><strong>{session.answers[q.question_id] || "未作答"}</strong></button></li>)}</ul>
        <Button disabled={busy || answered !== session.questions.length} onClick={() => void submit()}>{busy ? "正在提交…" : "确认提交答卷"}</Button>
      </div> : <article className="quiz-question-card">
        <div className="quiz-question-meta"><span>单选题 · {index + 1} / {session.questions.length}</span>{isReview && result && <strong className={result.is_correct ? "answer-correct" : "answer-incorrect"}>{result.is_correct ? "回答正确" : "需要回顾"}</strong>}</div>
        <h3>{question.question_text}</h3>
        <div className="quiz-options" role="group" aria-label="选项">{question.options.map(option => {
          const selected = session.answers[question.question_id] === option.id;
          const correct = isReview && result?.correct_answer === option.id;
          return <button type="button" key={option.id} disabled={busy || isReview} aria-pressed={selected} className={"quiz-option" + (selected ? " is-selected" : "") + (correct ? " is-correct" : "") + (isReview && selected && !correct ? " is-incorrect" : "")} onClick={() => {
            const answers = { ...session.answers, [question.question_id]: option.id }; setSession({ ...session, answers }); void save(answers);
          }}><span className="quiz-option-letter">{option.id}</span><span>{option.text}</span>{isReview && <small>{correct ? "正确答案" : selected ? "你的选择" : ""}</small>}</button>;
        })}</div>
        {isReview && result && <div className="quiz-explanation"><h4><Check size={18} />理解这道题</h4><p>{result.explanation}</p></div>}
      </article>}
      <footer className="learning-actions"><Button variant="outline" disabled={index === 0 || busy || checking} onClick={() => setIndex(i => i - 1)}><ArrowLeft />上一题</Button><span role="status">{busy ? "处理中…" : isReview ? "答对 " + (session.results?.filter(r => r.is_correct).length || 0) + " / " + session.questions.length + " 题" : saveState}</span>
        {!checking && (index < session.questions.length - 1 ? <Button disabled={busy || (!isReview && !session.answers[question.question_id])} onClick={() => setIndex(i => i + 1)}>下一题<ArrowRight /></Button> : !isReview ? <Button disabled={busy} onClick={() => setChecking(true)}>检查答卷<ArrowRight /></Button> : <Button disabled={!onContinue} onClick={onContinue}>继续文字推演<ArrowRight /></Button>)}
      </footer>
    </>}
    {canContinue && onContinue && (!isReview || checking) && <Button variant="outline" onClick={onContinue} className="mt-4">本环节已有完成记录 · 继续文字推演<ArrowRight /></Button>}
  </section>;
}
