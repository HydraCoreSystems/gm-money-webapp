-- GM Money's Postgres schema, isolated from HydraCloud's own `public`
-- schema tables in this same Supabase project. Apply this once in
-- Supabase Studio's SQL Editor, then add `gm_money` to
-- Settings -> API -> Exposed schemas so PostgREST (and therefore
-- @supabase/supabase-js) can actually query it.

create schema if not exists gm_money;

-- ============================================================
-- Reference / lookup tables (replace the Settings sheet's
-- column-range hack -- category type becomes a real constraint).
-- ============================================================

create table gm_money.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('Income', 'Expense')),
  sort_order int,
  created_at timestamptz not null default now()
);

create table gm_money.subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references gm_money.categories(id) on delete cascade,
  name text not null,
  sort_order int,
  unique (category_id, name)
);

create table gm_money.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int
);

create table gm_money.frequencies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table gm_money.app_config (
  id int primary key default 1 check (id = 1),
  financial_start_date date,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- App-owned transactional tables.
-- ============================================================

create table gm_money.recurring_transactions (
  schedule_id text primary key,
  payee text not null,
  amount numeric(12, 2) not null,
  account text not null,
  category_id uuid references gm_money.categories(id),
  subcategory_id uuid references gm_money.subcategories(id),
  payment_method_id uuid references gm_money.payment_methods(id),
  frequency_id uuid references gm_money.frequencies(id),
  next_due date not null,
  active boolean not null default true,
  auto_create boolean not null default false,
  notes text,
  updated_by text,
  updated_at timestamptz not null default now(),
  last_generated_due date
);

create table gm_money.manual_transactions (
  transaction_id text primary key,
  date date not null,
  account text not null,
  payee text not null,
  amount numeric(12, 2) not null,
  category_id uuid references gm_money.categories(id),
  subcategory_id uuid references gm_money.subcategories(id),
  payment_method_id uuid references gm_money.payment_methods(id),
  notes text,
  source text,
  status text not null check (status in ('Uncleared', 'Cleared')),
  matched_bank_key text,
  reconciled_date date,
  entered_by text,
  entered_at timestamptz not null default now(),
  schedule_id text references gm_money.recurring_transactions(schedule_id),
  scheduled_due_key text
);
create index on gm_money.manual_transactions (date);
create index on gm_money.manual_transactions (matched_bank_key) where matched_bank_key is not null;

create table gm_money.transaction_meta (
  transaction_key text primary key,
  subcategory_id uuid references gm_money.subcategories(id),
  notes text,
  review_status text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table gm_money.budgets (
  category_id uuid primary key references gm_money.categories(id) on delete cascade,
  monthly_budget numeric(12, 2) not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table gm_money.merchant_memory (
  merchant_key text primary key,
  preferred_merchant text not null,
  category_id uuid references gm_money.categories(id),
  subcategory_id uuid references gm_money.subcategories(id),
  times_used int not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  confidence int not null default 60,
  locked boolean not null default false
);

create table gm_money.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null unique,
  prefs jsonb not null default '{
    "upcomingBills": true, "overBudget": true, "lowBalance": false,
    "lowBalanceThreshold": 100, "newDeposits": false, "newDepositThreshold": 0
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Tiller mirror tables: synced periodically from the live Google
-- Sheet (see TillerSync.gs, Phase 4). The app never writes these
-- directly except the one category-registration append, which
-- happens on the Apps Script side against the real Sheet.
-- ============================================================

create table gm_money.tiller_transactions (
  transaction_key text primary key,
  date date not null,
  description text not null,
  category text,
  amount numeric(12, 2) not null,
  account text not null,
  institution text,
  categorized_by text,
  categorized_date timestamptz,
  synced_at timestamptz not null default now()
);

create table gm_money.tiller_categories (
  name text primary key,
  synced_at timestamptz not null default now()
);

create table gm_money.tiller_balance_history (
  account text not null,
  as_of_date date not null,
  balance numeric(12, 2) not null,
  synced_at timestamptz not null default now(),
  primary key (account, as_of_date)
);

create table gm_money.tiller_accounts (
  name text primary key,
  synced_at timestamptz not null default now()
);

-- ============================================================
-- Auth -- exact reuse of skrybix-webapp's pattern. Separate
-- password from HydraCloud's own site_auth (that one lives in
-- HydraCloud's `public` schema, this one is scoped to gm_money).
-- ============================================================

create table gm_money.site_auth (
  id int primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);
