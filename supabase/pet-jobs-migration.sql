-- 包 A：pet_jobs 工單佇列 + pets 產線欄位（可單獨喺 Supabase SQL Editor 跑）
-- 完整定義亦已 append 落 schema.sql；呢份方便只補呢次升級。

alter table public.pets add column if not exists kind text;
alter table public.pets add column if not exists partner_label text;
alter table public.pets add column if not exists exclusive boolean;

create index if not exists pets_kind_idx on public.pets (kind);
create index if not exists pets_partner_label_idx on public.pets (partner_label);

create table if not exists public.pet_jobs (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('catalogue', 'commission')),
  instructions    text,
  partner_label   text,
  exclusive       boolean not null default false,
  allow_text_only boolean not null default false,
  ref_images      jsonb not null default '[]'::jsonb,
  status          text not null default 'queued'
                  check (status in ('queued', 'running', 'consumed', 'cancelled', 'failed')),
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  consumed_at     timestamptz,
  started_at      timestamptz,
  pet_draft_id    text,
  error_message   text
);

create index if not exists pet_jobs_status_kind_created_idx
  on public.pet_jobs (status, kind, created_at);
create index if not exists pet_jobs_created_at_idx
  on public.pet_jobs (created_at desc);
create index if not exists pet_jobs_pet_draft_id_idx
  on public.pet_jobs (pet_draft_id);

alter table public.pet_jobs enable row level security;

create or replace function public.claim_pet_job(p_kind text)
returns setof public.pet_jobs
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_kind not in ('catalogue', 'commission') then
    raise exception 'invalid pet job kind: %', p_kind;
  end if;

  return query
  with next_job as (
    select id
    from public.pet_jobs
    where kind = p_kind
      and status = 'queued'
    order by created_at
    for update skip locked
    limit 1
  )
  update public.pet_jobs as job
  set status = 'running',
      started_at = now(),
      updated_at = now(),
      error_message = null
  from next_job
  where job.id = next_job.id
  returning job.*;
end;
$$;

revoke all on function public.claim_pet_job(text) from public;
revoke all on function public.claim_pet_job(text) from anon;
revoke all on function public.claim_pet_job(text) from authenticated;
grant execute on function public.claim_pet_job(text) to service_role;

-- Storage：Dashboard → Storage → New bucket → name: pet-job-refs → Public: OFF
-- （SQL 唔會建 bucket；jobs-repo.ensureBucket 可 best-effort 補建）
