create table if not exists gm_money.app_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  email text not null,
  display_name text not null,
  password_hash text not null,
  role text not null default 'member',
  is_active boolean not null default true,
  last_login_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_role_check check (role in ('owner', 'admin', 'member')),
  constraint app_users_email_lower_check check (email = lower(email))
);

create unique index if not exists app_users_business_email_uidx
  on gm_money.app_users (business_id, email);

create table if not exists gm_money.sync_events (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  source text not null,
  status text not null,
  received_at timestamptz not null default now(),
  processed_count int not null default 0,
  error_message text null,
  constraint sync_events_status_check check (status in ('success', 'error'))
);

create index if not exists sync_events_business_source_received_idx
  on gm_money.sync_events (business_id, source, received_at desc);