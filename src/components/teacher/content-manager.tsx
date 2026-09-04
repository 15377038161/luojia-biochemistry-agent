'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileImage, LoaderCircle, Plus, Save, Send, ShieldCheck, Upload, X } from 'lucide-react';
import type { ExperimentStep } from '@/domain/agent';
import { clientErrorMessage } from '@/lib/client-request';
import {
  defaultCourseContent,
  type ContentValidation,
  type CourseContentAsset,
  type CourseContentPayload,
  validateCourseContent,
} from '@/domain/course-content';

interface DraftRecord { id: string; version: number; status: string; updated_at?: string }
interface Props { preview?: boolean; initialStep?: number; focused?: boolean }
type EditorSection = 'theory' | 'sop' | 'rubric' | 'resources' | 'preview';

function copyDefault(): CourseContentPayload {
  return JSON.parse(JSON.stringify(defaultCourseContent())) as CourseContentPayload;
}

export default function ContentManager({ preview = false, initialStep = 1, focused = false }: Props) {
  const [content, setContent] = useState<CourseContentPayload>(copyDefault);
  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [activeStep, setActiveStep] = useState(initialStep);
  const [section, setSection] = useState<EditorSection>('theory');
  const [validation, setValidation] = useState<ContentValidation>(() => validateCourseContent(defaultCourseContent()));
  const [busy, setBusy] = useState<'load' | 'save' | 'publish' | 'upload' | ''>('');
  const [message, setMessage] = useState('');

  const step = content.steps.find((item) => item.id === activeStep) ?? content.steps[0];

  async function load() {
    if (preview) { const payload = copyDefault(); setContent(payload); setValidation(validateCourseContent(payload)); return; }
    setBusy('load'); setMessage('');
    try {
      const response = await fetch('/api/teacher/content', { cache: 'no-store' });
      const payload = await response.json() as { ok?: boolean; data?: { draft?: DraftRecord | null; payload?: CourseContentPayload; validation?: ContentValidation }; error?: { message?: string } };
      if (!response.ok || !payload.ok || !payload.data?.payload) throw new Error(payload.error?.message || '加载课程内容失败');
      setContent(payload.data.payload); setDraft(payload.data.draft ?? null);
      setValidation(payload.data.validation ?? validateCourseContent(payload.data.payload));
    } catch (reason) { setMessage(clientErrorMessage(reason, '加载课程内容失败')); }
    finally { setBusy(''); }
  }

  useEffect(() => { void load(); }, [preview]);

  function commit(next: CourseContentPayload) {
    setContent(next); setValidation(validateCourseContent(next));
  }

  function updateStep(patch: Partial<ExperimentStep>) {
    commit({ ...content, steps: content.steps.map((item) => item.id === activeStep ? { ...item, ...patch } : item) });
  }

  function updateGate(index: number, field: 'label' | 'guidance', value: string) {
    if (!step) return;
    updateStep({ gates: step.gates.map((gate, gateIndex) => gateIndex === index ? { ...gate, [field]: value } : gate) });
  }

  function updatePoint(index: number, field: 'label' | 'hint', value: string) {
    if (!step) return;
    updateStep({
      keyPoints: step.keyPoints.map((point, pointIndex) => pointIndex === index
        ? field === 'label' ? { ...point, label: value } : { ...point, hints: [value, point.hints[1], point.hints[2]] }
        : point),
    });
  }

  function updateList(field: 'sopParameters' | 'safetyNotes' | 'decisionTree' | 'instruments', value: string) {
    updateStep({ [field]: value.split('\n').map((item) => item.trim()).filter(Boolean) });
  }

  async function save() {
    if (busy) return;
    setBusy('save'); setMessage('');
    try {
      if (preview) {
        setDraft({ id: 'preview-draft', version: (draft?.version ?? 0) + 1, status: 'draft' });
      } else {
        const response = await fetch('/api/teacher/content', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId: draft?.status === 'draft' ? draft.id : undefined, payload: content, sourceRefs: content.assets.map((asset) => asset.sourceRef) }),
        });
        const payload = await response.json() as { ok?: boolean; data?: { draft?: DraftRecord; validation?: ContentValidation }; error?: { message?: string } };
        if (!response.ok || !payload.ok || !payload.data?.draft) throw new Error(payload.error?.message || '保存草稿失败');
        setDraft(payload.data.draft); setValidation(payload.data.validation ?? validateCourseContent(content));
      }
      setMessage('草稿已保存，学生当前绑定版本不会受到影响。');
    } catch (reason) { setMessage(clientErrorMessage(reason, '保存草稿失败')); }
    finally { setBusy(''); }
  }

  async function publish() {
    if (!draft || draft.status !== 'draft') { setMessage('请先保存一个新的草稿版本。'); return; }
    const currentValidation = validateCourseContent(content);
    setValidation(currentValidation);
    if (!currentValidation.valid) { setMessage(`发布前校验未通过：${currentValidation.errors[0]}`); return; }
    setBusy('publish'); setMessage('');
    try {
      if (!preview) {
        const response = await fetch('/api/teacher/content/publish', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draftId: draft.id }),
        });
        const payload = await response.json() as { ok?: boolean; error?: { message?: string } };
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message || '发布失败');
      }
      setDraft({ ...draft, status: 'published' });
      setMessage(`内容 V${draft.version} 已发布；已开始的会话仍使用原版本。`);
    } catch (reason) { setMessage(clientErrorMessage(reason, '发布失败')); }
    finally { setBusy(''); }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !step || busy) return;
    setBusy('upload'); setMessage('');
    try {
      let path = URL.createObjectURL(file);
      if (!preview) {
        const form = new FormData(); form.append('file', file); form.append('stepId', String(step.id));
        const response = await fetch('/api/teacher/content/assets', { method: 'POST', body: form });
        const payload = await response.json() as { ok?: boolean; data?: { url?: string; path?: string }; error?: { message?: string } };
        if (!response.ok || !payload.ok || !payload.data?.url) throw new Error(payload.error?.message || '上传素材失败');
        path = payload.data.url;
      }
      const asset: CourseContentAsset = {
        id: `${step.id}-${Date.now()}`, stepId: step.id, kind: 'case_image', title: file.name,
        path, sourceRef: `教师上传：${file.name}`,
      };
      commit({ ...content, assets: [...content.assets, asset] });
      setMessage('素材已加入当前草稿，保存后生效。');
    } catch (reason) { setMessage(clientErrorMessage(reason, '上传素材失败')); }
    finally { setBusy(''); }
  }

  const assets = useMemo(() => content.assets.filter((asset) => asset.stepId === activeStep), [content.assets, activeStep]);
  function removeAsset(id: string) { commit({ ...content, assets: content.assets.filter((asset) => asset.id !== id) }); }

  return (
    <section id="content-management" className="teacher-work-panel teacher-content-manager" aria-labelledby="content-title">
      <div className="teacher-panel-heading">
        <div><p>版本化课程内容</p><h2 id="content-title">八步任务与教学素材</h2></div>
        <span className="teacher-content-version">{draft ? `V${draft.version} · ${draft.status === 'published' ? '已发布' : '草稿'}` : '尚未保存'}</span>
      </div>
      <p className="teacher-panel-lead">EGFP 是推荐示例，学生可按会话自选目标基因。分屏编辑理论、SOP、安全、评分、Gate 与课程资料，发布前统一校验。</p>

      {!focused && <div className="teacher-step-tabs" role="tablist" aria-label="八步课程内容">
        {content.steps.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === activeStep} onClick={() => setActiveStep(item.id)} className={item.id === activeStep ? 'is-active' : ''}><span>{item.id}</span>{item.shortTitle}</button>)}
      </div>}

      <div className="teacher-editor-sections" role="tablist" aria-label="内容编辑分区">
        {([
          ['theory', '理论与任务'], ['sop', 'SOP参数与安全'], ['rubric', '评分与 Gate'], ['resources', '资料与设备'], ['preview', '预览发布'],
        ] as Array<[EditorSection, string]>).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={section === key} onClick={() => setSection(key)} className={section === key ? 'is-active' : ''}>{label}</button>)}
      </div>

      {busy === 'load' || !step ? <p className="teacher-panel-loading"><LoaderCircle className="animate-spin" />正在读取内容草稿…</p> : (
        <div className="teacher-content-grid is-sectioned">
          {section === 'theory' &&
          <div className="teacher-content-fields">
            <label>步骤标题<input value={step.title} onChange={(event) => updateStep({ title: event.target.value })} /></label>
            <label>任务情境<textarea rows={4} value={step.context} onChange={(event) => updateStep({ context: event.target.value })} /></label>
            <label>学习目标 / 理论提示<textarea rows={3} value={step.goal} onChange={(event) => updateStep({ goal: event.target.value })} /></label>
            <label>底层原理<textarea rows={10} value={step.principle} onChange={(event) => updateStep({ principle: event.target.value })} /></label>
            <label>来源依据<input value={step.source} onChange={(event) => updateStep({ source: event.target.value })} /></label>
          </div>}
          {section === 'sop' && <div className="teacher-content-fields">
            <label>SOP 参数（每行一项）<textarea rows={7} value={step.sopParameters.join('\n')} onChange={(event) => updateList('sopParameters', event.target.value)} /></label>
            <label>安全事项（每行一项）<textarea rows={6} value={step.safetyNotes.join('\n')} onChange={(event) => updateList('safetyNotes', event.target.value)} /></label>
            <label>决策树与排错（每行一项）<textarea rows={7} value={step.decisionTree.join('\n')} onChange={(event) => updateList('decisionTree', event.target.value)} /></label>
            <label>科学实践要求<textarea rows={4} value={step.scientificPractice} onChange={(event) => updateStep({ scientificPractice: event.target.value })} /></label>
          </div>}
          {section === 'resources' && <div className="teacher-content-fields">
            <label>设备与识别要点（每行一项）<textarea rows={6} value={step.instruments.join('\n')} onChange={(event) => updateList('instruments', event.target.value)} /></label>
            <div className="teacher-content-subsection">
              <div><h3>案例图与图片题素材</h3><label className="teacher-upload-button"><Upload aria-hidden />{busy === 'upload' ? '上传中…' : '上传图片'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void upload(event)} disabled={Boolean(busy)} /></label></div>
              {assets.length === 0 ? <p className="teacher-content-empty"><FileImage aria-hidden />当前步骤暂无案例素材，可仅使用文字任务。</p> : (
                <ul className="teacher-asset-list">{assets.map((asset) => <li key={asset.id}><FileImage aria-hidden /><span><b>{asset.title}</b><small>{asset.sourceRef}</small></span><button type="button" onClick={() => removeAsset(asset.id)} aria-label={`移除${asset.title}`}><X aria-hidden /></button></li>)}</ul>
              )}
            </div>
          </div>}

          {section === 'rubric' &&
          <div className="teacher-content-rules">
            <div className="teacher-content-subsection"><h3>五维评分点</h3>{step.keyPoints.map((point, index) => <article key={point.id}><span>{point.dimension}</span><input aria-label={`${point.dimension}评分点`} value={point.label} onChange={(event) => updatePoint(index, 'label', event.target.value)} /><textarea aria-label={`${point.dimension}提示`} rows={2} value={point.hints[0]} onChange={(event) => updatePoint(index, 'hint', event.target.value)} /></article>)}</div>
            <div className="teacher-content-subsection"><h3>Gate 检查规则</h3>{step.gates.map((gate, index) => <article key={gate.id}><input aria-label="Gate规则" value={gate.label} onChange={(event) => updateGate(index, 'label', event.target.value)} /><textarea aria-label="Gate指导" rows={2} value={gate.guidance} onChange={(event) => updateGate(index, 'guidance', event.target.value)} /></article>)}</div>
          </div>}
          {section === 'preview' && <div className="teacher-content-fields teacher-content-preview">
            <span className="teacher-content-version">步骤 {step.id} · {step.shortTitle}</span>
            <h3>{step.title}</h3><p>{step.context}</p><p><b>学习目标：</b>{step.goal}</p>
            <div className="teacher-preview-grid"><article><b>SOP</b><ul>{step.sopParameters.map((item) => <li key={item}>{item}</li>)}</ul></article><article><b>Gate</b><ul>{step.gates.map((item) => <li key={item.id}>{item.label}</li>)}</ul></article></div>
          </div>}
        </div>
      )}

      <div className={`teacher-validation ${validation.valid ? 'is-valid' : 'is-invalid'}`}>
        {validation.valid ? <><CheckCircle2 aria-hidden /><span><b>发布校验通过</b><small>八步连续、五维完整、Gate 与来源均可追溯。</small></span></> : <><ShieldCheck aria-hidden /><span><b>还有 {validation.errors.length} 项需要修正</b><small>{validation.errors.slice(0, 3).join('；')}</small></span></>}
      </div>
      <div className="teacher-content-actions">
        <button type="button" onClick={() => void save()} disabled={Boolean(busy)}><Save aria-hidden />{busy === 'save' ? '保存中…' : '保存草稿'}</button>
        <button type="button" className="is-primary" onClick={() => void publish()} disabled={Boolean(busy) || !validation.valid}><Send aria-hidden />{busy === 'publish' ? '发布中…' : '校验并发布'}</button>
      </div>
      {message && <p className="teacher-panel-message">{message}</p>}
    </section>
  );
}
