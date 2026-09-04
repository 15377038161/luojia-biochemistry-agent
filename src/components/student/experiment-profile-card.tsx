'use client';

import { useEffect, useState } from 'react';
import { Check, Dna, LoaderCircle, LockKeyhole, Save } from 'lucide-react';
import type { ApiResult } from '@/domain/agent';
import { clientErrorMessage } from '@/lib/client-request';

type SequenceSource = 'recommended' | 'accession' | 'pasted';
type CloningStrategy = 'recombination' | 'double_digest';

interface ProfileRecord {
  target_gene: string;
  sequence_source: SequenceSource;
  accession: string | null;
  coding_sequence: string | null;
  cloning_strategy: CloningStrategy;
  design_snapshot: { sequence_length?: number | null; gc_percent?: number | null; source_label?: string };
}

interface Props {
  sessionId: string;
  preview: boolean;
}

const DEFAULT_PROFILE: ProfileRecord = {
  target_gene: 'EGFP', sequence_source: 'recommended', accession: null, coding_sequence: null,
  cloning_strategy: 'recombination', design_snapshot: { sequence_length: 720, source_label: '课程推荐EGFP编码序列' },
};

export default function ExperimentProfileCard({ sessionId, preview }: Props) {
  const [profile, setProfile] = useState<ProfileRecord>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(preview ? '预览模式：可体验选择，正式会话中将在步骤1提交后锁定。' : '');

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void fetch(`/api/student/experiment-profile?sessionId=${encodeURIComponent(sessionId)}`)
      .then((response) => response.json() as Promise<ApiResult<ProfileRecord>>)
      .then((payload) => {
        if (!cancelled && payload.ok) setProfile(payload.data);
        if (!cancelled && !payload.ok) setNotice(payload.error.message);
      })
      .catch((error) => { if (!cancelled) setNotice(clientErrorMessage(error, '实验对象加载失败')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [preview, sessionId]);

  async function save() {
    if (saving) return;
    if (preview) { setNotice('预览选择已更新；正式会话会把该设置贯穿八步评测与报告。'); return; }
    setSaving(true); setNotice('');
    try {
      const response = await fetch('/api/student/experiment-profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          targetGene: profile.target_gene,
          sequenceSource: profile.sequence_source,
          accession: profile.accession,
          codingSequence: profile.coding_sequence,
          cloningStrategy: profile.cloning_strategy,
        }),
      });
      const payload = await response.json() as ApiResult<ProfileRecord>;
      if (!payload.ok) throw new Error(payload.error.message);
      setProfile(payload.data);
      setNotice('实验对象已保存。步骤1提交后将锁定，并贯穿后续七步与学习报告。');
    } catch (error) {
      setNotice(clientErrorMessage(error, '保存失败'));
    } finally { setSaving(false); }
  }

  const update = <K extends keyof ProfileRecord>(key: K, value: ProfileRecord[K]) => setProfile((current) => ({ ...current, [key]: value }));

  return (
    <section className="gene-profile-card mt-5 rounded-2xl border border-primary/20 bg-card/95 p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-black"><Dna className="h-5 w-5 text-primary" /> 本次八步实验对象</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">先确定目标基因和克隆路线。此档案会进入引物设计、表达分析、纯化决策和最终报告。</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-bold text-warning"><LockKeyhole className="h-3.5 w-3.5" /> 步骤1提交后锁定</span>
      </div>

      {loading ? <p className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />正在读取实验档案…</p> : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-3">
            <label className="block text-xs font-bold">序列来源
              <select value={profile.sequence_source} onChange={(event) => update('sequence_source', event.target.value as SequenceSource)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
                <option value="recommended">课程推荐 EGFP</option>
                <option value="accession">输入 GenBank 登录号</option>
                <option value="pasted">粘贴 DNA 编码序列</option>
              </select>
            </label>
            <label className="block text-xs font-bold">目标基因
              <input value={profile.sequence_source === 'recommended' ? 'EGFP' : profile.target_gene} disabled={profile.sequence_source === 'recommended'} onChange={(event) => update('target_gene', event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:bg-muted" placeholder="例如：GFP、lacZ" />
            </label>
            {profile.sequence_source === 'accession' && <label className="block text-xs font-bold">GenBank 登录号
              <input value={profile.accession || ''} onChange={(event) => update('accession', event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" placeholder="例如：MN000001.1" />
            </label>}
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-bold">克隆策略
              <select value={profile.cloning_strategy} onChange={(event) => update('cloning_strategy', event.target.value as CloningStrategy)} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
                <option value="recombination">同源重组（课程主线）</option>
                <option value="double_digest">双酶切连接（备选）</option>
              </select>
            </label>
            {profile.sequence_source === 'pasted' && <label className="block text-xs font-bold">DNA 编码序列
              <textarea value={profile.coding_sequence || ''} onChange={(event) => update('coding_sequence', event.target.value)} className="mt-1.5 min-h-28 w-full resize-y rounded-xl border border-border bg-background p-3 font-mono text-xs leading-5" placeholder="仅输入 A / C / G / T / N，可包含空格和换行" />
            </label>}
            <button type="button" onClick={save} disabled={saving} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 保存并用于八步实验
            </button>
          </div>
        </div>
      )}
      {notice && <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary-container/50 px-3 py-2 text-xs leading-5 text-primary"><Check className="mt-0.5 h-4 w-4 shrink-0" />{notice}</p>}
    </section>
  );
}
