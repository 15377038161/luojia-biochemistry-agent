'use client';

import { useEffect, useState } from 'react';
import { CircleCheckBig, CloudCog, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import type { IntegrationStatus, IntegrationStatusItem } from '@/lib/integration-status';

interface Props { preview?: boolean }

interface SyncSummary {
  counts: { pending: number; processing: number; succeeded: number; failed: number; manual: number };
  sampled: boolean;
}

const PREVIEW_STATUS: IntegrationStatus = {
  supabase: { state: 'fixture', label: 'Supabase', detail: '预览环境使用演示数据' },
  coze: { state: 'fixture', label: 'Coze 智能体', detail: '当前使用本地评阅夹具' },
  chaoxingAuth: { state: 'pending', label: '学习通身份', detail: '待校方 OAuth 参数联调' },
  chaoxingForm: { state: 'pending', label: '超星表单', detail: '待表单 3513491 正式写入授权' },
};

function statusCopy(item: IntegrationStatusItem) {
  if (item.state === 'ready') return { label: '已配置', icon: CircleCheckBig };
  if (item.state === 'fixture') return { label: '本地夹具', icon: CloudCog };
  if (item.state === 'configured') return { label: '待回查', icon: LoaderCircle };
  if (item.state === 'error') return { label: '配置错误', icon: TriangleAlert };
  return { label: '待联调', icon: TriangleAlert };
}

export default function IntegrationStatusPanel({ preview = false }: Props) {
  const [status, setStatus] = useState<IntegrationStatus | null>(preview ? PREVIEW_STATUS : null);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState('');

  async function load() {
    if (preview) { setStatus(PREVIEW_STATUS); return; }
    setError('');
    try {
      const [integrationResponse, syncResponse] = await Promise.all([
        fetch('/api/auth/me', { cache: 'no-store' }),
        fetch('/api/teacher/integration-status', { cache: 'no-store' }),
      ]);
      const payload = await integrationResponse.json() as { integrations?: IntegrationStatus; error?: string };
      const syncPayload = await syncResponse.json() as SyncSummary & { error?: string };
      if (!integrationResponse.ok || !payload.integrations) throw new Error(payload.error || '无法读取服务状态');
      setStatus(payload.integrations);
      if (syncResponse.ok && syncPayload.counts) setSummary(syncPayload);
      else setError(syncPayload.error || '无法读取同步队列状态');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取服务状态');
    }
  }

  useEffect(() => { void load(); }, [preview]);

  return (
    <section id="integration-status" className="teacher-work-panel" aria-labelledby="integration-title">
      <div className="teacher-panel-heading">
        <div><p>生产门禁</p><h2 id="integration-title">外部服务真实状态</h2></div>
        <button type="button" onClick={() => void load()} aria-label="刷新服务状态"><RefreshCw aria-hidden /></button>
      </div>
      <p className="teacher-panel-lead">只展示当前环境的真实配置状态。未完成校方参数和回读校验时，一律标记为“待联调”。</p>
      {error && <p className="teacher-panel-error">{error}</p>}
      {!status ? <p className="teacher-panel-loading"><LoaderCircle aria-hidden />正在检查服务状态…</p> : (
        <div className="teacher-integration-grid">
          {Object.values(status).map((item) => {
            const copy = statusCopy(item);
            const Icon = copy.icon;
            return <article key={item.label} data-state={item.state}><span><Icon aria-hidden /></span><div><h3>{item.label}</h3><p>{item.detail}</p></div><b>{copy.label}</b></article>;
          })}
        </div>
      )}
      {summary && <div className="teacher-sync-summary" aria-label="超星同步队列状态">
        <div><b>{summary.counts.succeeded}</b><span>已写入超星</span></div>
        <div><b>{summary.counts.pending + summary.counts.processing}</b><span>等待重试</span></div>
        <div><b>{summary.counts.manual}</b><span>人工处理</span></div>
        <div><b>{summary.counts.failed}</b><span>失败待处理</span></div>
        {summary.sampled && <small>队列超过 5000 条，以上为最近采样汇总。</small>}
      </div>}
    </section>
  );
}
