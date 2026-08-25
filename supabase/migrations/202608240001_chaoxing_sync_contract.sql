-- 超星外部留痕适配：保存外部记录标识，便于幂等对账与回查。
alter table public.sync_outbox
  add column if not exists external_record_id text;

create index if not exists sync_outbox_external_record_idx
  on public.sync_outbox(external_record_id)
  where external_record_id is not null;
