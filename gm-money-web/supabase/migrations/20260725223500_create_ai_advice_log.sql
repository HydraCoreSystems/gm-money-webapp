create table if not exists gm_money.ai_advice_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  question text not null,
  answer text not null,
  priorities jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  confidence text not null default 'medium',
  model text not null,
  context_snapshot text null,
  created_at timestamptz not null default now(),
  constraint ai_advice_log_confidence_check check (confidence in ('high', 'medium', 'low'))
);

create index if not exists ai_advice_log_business_created_idx
  on gm_money.ai_advice_log (business_id, created_at desc);
