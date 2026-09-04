'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Bot, CheckCircle2, LoaderCircle, PencilLine, Save, Send, X } from 'lucide-react';
import { clientErrorMessage } from '@/lib/client-request';

type QuestionStatus = 'draft' | 'published' | 'archived';
type QuestionDimension = 'knowledge' | 'detail' | 'data';
interface QuestionOption { id: string; text: string }
interface Question {
  id: string;
  step_no: number;
  dimension: QuestionDimension;
  question_text: string;
  options: QuestionOption[];
  correct_option_id: string;
  explanation: string;
  status: QuestionStatus;
  updated_at?: string;
}
interface Props { stepNo: number; preview?: boolean }

const dimensionLabels: Record<QuestionDimension, string> = {
  knowledge: '知识原理', detail: '实验细节', data: '数据解读',
};

function previewQuestions(stepNo: number): Question[] {
  return [
    ['knowledge', '本步骤核心原理与实验结果之间最准确的因果关系是什么？'],
    ['detail', '执行本步骤时，哪组温度、时间和操作顺序最符合规范？'],
    ['data', '观察到对照组与实验组数据差异后，下一步应如何判断并排除误差？'],
  ].map(([dimension, questionText], index) => ({
    id: `preview-${stepNo}-${index}`, step_no: stepNo, dimension: dimension as QuestionDimension,
    question_text: questionText,
    options: ['规范操作与正确解释', '只描述现象', '忽略对照条件', '跳过关键参数'].map((text, optionIndex) => ({ id: String.fromCharCode(65 + optionIndex), text })),
    correct_option_id: 'A',
    explanation: '正确选项同时覆盖了核心原理、关键条件和从观察到结论的推导过程；其余选项分别遗漏了因果关系、对照或关键参数。',
    status: index === 0 ? 'published' : 'draft',
  }));
}

export default function QuestionBankManager({ stepNo, preview = false }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editing, setEditing] = useState<Question | null>(null);
  const [busy, setBusy] = useState<'load' | 'generate' | 'publish' | 'save' | ''>('');
  const [message, setMessage] = useState('');
  const [mobile, setMobile] = useState(false);

  async function load() {
    if (preview) { setQuestions(previewQuestions(stepNo)); setEditing(null); return; }
    setBusy('load'); setMessage('');
    try {
      const response = await fetch(`/api/teacher/questions?stepNo=${stepNo}`, { cache: 'no-store' });
      const payload = await response.json() as { ok?: boolean; data?: { questions?: Question[] }; error?: { message?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || '加载题库失败');
      setQuestions(payload.data?.questions ?? []); setEditing(null);
    } catch (reason) { setMessage(clientErrorMessage(reason, '加载题库失败')); }
    finally { setBusy(''); }
  }

  useEffect(() => { void load(); }, [stepNo, preview]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  async function generate() {
    if (busy) return;
    setBusy('generate'); setMessage('');
    try {
      if (preview) {
        setQuestions((current) => [
          ...previewQuestions(stepNo).map((item) => ({ ...item, id: `${item.id}-generated-${current.length}` })),
          ...current,
        ]);
        setMessage('已生成 3 道预览草稿；正式环境默认一次生成 10 道。');
      } else {
        const response = await fetch('/api/teacher/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', stepNo, count: 10 }) });
        const payload = await response.json() as { ok?: boolean; data?: { created?: number }; error?: { message?: string } };
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message || 'AI 出题失败');
        setMessage(`AI 已生成 ${payload.data?.created ?? 0} 道草稿，请审核答案和解析后再发布。`);
        await load();
      }
    } catch (reason) { setMessage(clientErrorMessage(reason, 'AI 出题失败')); }
    finally { setBusy(''); }
  }

  async function publishAll() {
    if (busy) return;
    setBusy('publish'); setMessage('');
    try {
      if (preview) setQuestions((current) => current.map((item) => ({ ...item, status: 'published' })));
      else {
        const response = await fetch('/api/teacher/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publish', stepNo }) });
        const payload = await response.json() as { ok?: boolean; error?: { message?: string } };
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message || '发布题目失败');
        await load();
      }
      setMessage('本步骤所有审核草稿已发布，学生下次开考可直接抽取。');
    } catch (reason) { setMessage(clientErrorMessage(reason, '发布题目失败')); }
    finally { setBusy(''); }
  }

  async function save(nextStatus = editing?.status) {
    if (!editing || !nextStatus || busy) return;
    const next = { ...editing, status: nextStatus };
    setBusy('save'); setMessage('');
    try {
      if (!preview) {
        const response = await fetch('/api/teacher/questions', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: next.id, stepNo: next.step_no, dimension: next.dimension, questionText: next.question_text, options: next.options, correctOptionId: next.correct_option_id, explanation: next.explanation, status: next.status }),
        });
        const payload = await response.json() as { ok?: boolean; error?: { message?: string } };
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message || '保存题目失败');
      }
      setQuestions((current) => next.status === 'archived' ? current.filter((item) => item.id !== next.id) : current.map((item) => item.id === next.id ? next : item));
      setEditing(next.status === 'archived' ? null : next);
      setMessage(next.status === 'archived' ? '题目已归档，不再参与抽题。' : next.status === 'published' ? '题目已保存并发布。' : '题目草稿已保存。');
    } catch (reason) { setMessage(clientErrorMessage(reason, '保存题目失败')); }
    finally { setBusy(''); }
  }

  const counts = useMemo(() => ({
    published: questions.filter((item) => item.status === 'published').length,
    draft: questions.filter((item) => item.status === 'draft').length,
  }), [questions]);

  const editorPanel = <section className={`teacher-question-editor ${editing ? 'is-open' : ''}`} aria-label="题目编辑器">
    {!editing ? <div className="teacher-question-editor-empty"><PencilLine /><h3>选择一道题进行审核</h3><p>教师可修改题干、选项、正确答案和详细解析；草稿不会被学生抽到。</p></div> : <>
      <header><div><span>{editing.status === 'published' ? '已发布题目' : '待审核草稿'}</span><h3>编辑题目</h3></div><button type="button" onClick={() => setEditing(null)} aria-label="关闭编辑器"><X /></button></header>
      <div className="teacher-question-form">
        <label>考查维度<select value={editing.dimension} onChange={(event) => setEditing({ ...editing, dimension: event.target.value as QuestionDimension })}><option value="knowledge">知识原理</option><option value="detail">实验细节</option><option value="data">数据解读</option></select></label>
        <label>题干<textarea rows={4} value={editing.question_text} onChange={(event) => setEditing({ ...editing, question_text: event.target.value })} /></label>
        <fieldset><legend>选项与正确答案</legend>{editing.options.map((option, index) => <label key={option.id} className="teacher-question-option"><input type="radio" name={`answer-${editing.id}`} checked={editing.correct_option_id === option.id} onChange={() => setEditing({ ...editing, correct_option_id: option.id })} /><span>{option.id}</span><input value={option.text} onChange={(event) => setEditing({ ...editing, options: editing.options.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} /></label>)}</fieldset>
        <label>详细解析<textarea rows={7} value={editing.explanation} onChange={(event) => setEditing({ ...editing, explanation: event.target.value })} /></label>
      </div>
      <footer><button type="button" className="is-danger" onClick={() => void save('archived')} disabled={Boolean(busy)}><Archive />归档</button><span /><button type="button" onClick={() => void save('draft')} disabled={Boolean(busy)}><Save />保存草稿</button><button type="button" className="is-primary" onClick={() => void save('published')} disabled={Boolean(busy)}><CheckCircle2 />保存并发布</button></footer>
    </>}
  </section>;

  return <div className="teacher-question-bank">
    <header className="teacher-question-toolbar">
      <div><span>步骤 {stepNo} 题库</span><strong>{counts.published} 道已发布 · {counts.draft} 道待审核</strong></div>
      <div>
        <button type="button" onClick={() => void generate()} disabled={Boolean(busy)}><Bot aria-hidden />{busy === 'generate' ? 'AI 出题中…' : 'AI 生成 10 题'}</button>
        <button type="button" className="is-primary" onClick={() => void publishAll()} disabled={Boolean(busy) || counts.draft === 0}><Send aria-hidden />发布全部草稿</button>
      </div>
    </header>

    <div className="teacher-question-workspace">
      <section className="teacher-question-list" aria-label="题目列表">
        {busy === 'load' ? <p className="teacher-question-empty"><LoaderCircle className="animate-spin" />正在读取题库…</p> : questions.length === 0 ? <p className="teacher-question-empty"><Bot />暂无题目。先让 AI 生成草稿，再由教师审核发布。</p> : questions.map((question, index) =>
          <button type="button" key={question.id} className={editing?.id === question.id ? 'is-active' : ''} onClick={() => setEditing({ ...question, options: question.options.map((option) => ({ ...option })) })}>
            <span className={`teacher-question-status is-${question.status}`}>{question.status === 'published' ? '已发布' : '草稿'}</span>
            <small>第 {index + 1} 题 · {dimensionLabels[question.dimension]}</small>
            <b>{question.question_text}</b><PencilLine aria-hidden />
          </button>)}
      </section>

      {mobile && editing ? createPortal(editorPanel, document.body) : editorPanel}
    </div>
    {message && <p className="teacher-panel-message">{message}</p>}
  </div>;
}
