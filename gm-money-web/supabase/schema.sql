-- GM Money's Postgres schema in HydraCloud's Supabase project.
--
-- IMPORTANT: as of 2026-07-25, tables 1-17 below ALREADY EXIST in the
-- live database with real, migrated Gathering Moss transaction data in
-- them (a prior ChatGPT session built and populated this before hitting
-- its own usage limit -- discovered mid-session when this project's own
-- from-scratch schema collided with it). This file is now DOCUMENTATION
-- of the real, adopted schema, reverse-engineered from PostgREST's
-- OpenAPI introspection -- it is NOT meant to be re-run against the real
-- database (every "create table" below would just fail with "already
-- exists", same as our original migration attempt did).
--
-- The only genuinely new, safe-to-run statement is at the very bottom:
-- `site_auth` (this schema had everything for business data, but nothing
-- yet for the app's own password login).
--
-- Real data facts confirmed 2026-07-25: 1 business ("Gathering Moss"),
-- 2 accounts ("Spend", "Business Checking", both PNC via Tiller),
-- 4,674 transactions spanning 2024-07-16 through 2026-07-27, 78
-- categories (hierarchical via parent_id, not a separate subcategories
-- table), 61 merchant_rules. Per the owner's explicit instruction,
-- anything dated before 2026-07-01 should be filtered out of the app
-- (not necessarily deleted from the table -- filter at the query level
-- unless/until he confirms he wants the old rows actually removed).

-- ============================================================
-- 1. businesses / business_members
-- Multi-tenant-ready (a single business today: "Gathering Moss"),
-- and business_members already anticipates real per-user accounts
-- (user_id + role) -- the eventual target already discussed for this
-- app, not yet built. Not used by anything yet; single shared password
-- (site_auth, below) is still how login works for now.
-- ============================================================
-- businesses(id uuid pk, name text, base_currency text, time_zone text, created_at, updated_at)
-- business_members(business_id uuid, user_id uuid, role text, created_at)  -- composite/no separate pk seen

-- ============================================================
-- 2. categories — hierarchical via parent_id (category AND subcategory
-- live in ONE table; a subcategory is just a row whose parent_id points
-- at its category). category_type ('income'|'expense', lowercase) is
-- the Type invariant -- confirm during Phase 5/6 work that every child
-- row shares its parent's category_type, since GM Money's core rule is
-- "Type lives on Category, never independently settable."
-- ============================================================
-- categories(id uuid pk, business_id uuid, parent_id uuid null, name text,
--   category_type text, tax_code text null, is_active bool, sort_order int,
--   created_at, updated_at)

-- ============================================================
-- 3. accounts — real table now (was a Tiller-sheet read in the old app).
-- external_source='tiller', external_account_id = Tiller's own account id.
-- ============================================================
-- accounts(id uuid pk, business_id uuid, name text, institution_name text,
--   account_type text, currency text, external_source text,
--   external_account_id text, opening_balance numeric, is_active bool,
--   created_at, updated_at)

-- ============================================================
-- 4. transactions — the BIG unified table. Replaces the old app's split
-- between GM_ManualTransactions and Tiller's own Transactions sheet with
-- one table + a `source` discriminator ('sheet_manual' | 'tiller' seen so
-- far). Also already has fields anticipating the AI co-CFO direction
-- (is_ai_suggested, ai_suggestion_approved_at) and legacy bridge fields
-- (legacy_source_row, legacy_transaction_key) for tracing back to the old
-- system during/after migration.
-- ============================================================
-- transactions(id uuid pk, business_id uuid, account_id uuid,
--   category_id uuid null, counterparty_id uuid null,
--   transaction_date date, authorized_at timestamptz null,
--   posted_at timestamptz null, description text, amount numeric,
--   currency text, status text ('uncleared'|'cleared', lowercase),
--   source text, source_record_id text, source_bank_key text null,
--   payment_method text null, notes text null, entered_by uuid null,
--   reconciled_at timestamptz null, schedule_id uuid null,
--   raw_source_record_id uuid null (-> source_records.id),
--   is_ai_suggested bool, ai_suggestion_approved_at timestamptz null,
--   created_at, updated_at, review_status text ('unreviewed' seen),
--   reviewed_at timestamptz null, legacy_source_row int null,
--   legacy_transaction_key text null)

-- ============================================================
-- 5. transaction_splits — genuinely new capability vs. the old app
-- (one transaction, multiple categories). Not currently exposed in the
-- old UI at all -- worth a deliberate decision on whether/when to build
-- UI for this, not just silently ignore it.
-- ============================================================
-- transaction_splits(id uuid pk, transaction_id uuid, category_id uuid,
--   amount numeric, memo text null, created_at)

-- ============================================================
-- 6. transaction_matches — structured manual<->bank match records,
-- replacing the old app's single "Matched Bank Key" field on one row.
-- ============================================================
-- transaction_matches(id uuid pk, business_id uuid,
--   manual_transaction_id uuid, bank_transaction_id uuid,
--   match_method text, confidence numeric, matched_by uuid null,
--   matched_at timestamptz)

-- ============================================================
-- 7. recurring_transactions — same concept as the old app's
-- GM_RecurringTransactions, plus occurrence_limit/occurrences_generated/
-- completed_at (a schedule can now have a defined end, not just run
-- forever).
-- ============================================================
-- recurring_transactions(id uuid pk, business_id uuid, account_id uuid,
--   category_id uuid, counterparty_id uuid null, payee text, amount numeric,
--   frequency text, next_due date, payment_method text null, notes text null,
--   is_active bool, auto_create bool, last_generated_due date null,
--   source_schedule_id text null, created_at, updated_at,
--   occurrence_limit int null, occurrences_generated int, completed_at timestamptz null)

-- ============================================================
-- 8. merchant_memory equivalent: merchant_rules. Same confidence-learning
-- shape as the old app's GM_MerchantMemory -- times_used, confidence,
-- is_locked, first_seen_at/last_seen_at. Port the existing +4/-12/floor-40/
-- threshold-70/90 algorithm against this table unchanged.
-- ============================================================
-- merchant_rules(id uuid pk, business_id uuid, merchant_key text,
--   preferred_name text, category_id uuid, times_used int, confidence numeric,
--   first_seen_at timestamptz, last_seen_at timestamptz, is_locked bool,
--   created_at, updated_at)

-- ============================================================
-- 9. budgets — period-based (period_start + period_type), a more
-- flexible model than the old app's single "monthly budget per category."
-- ============================================================
-- budgets(id uuid pk, business_id uuid, category_id uuid, period_start date,
--   period_type text, amount numeric, updated_by uuid null, created_at, updated_at)

-- ============================================================
-- 10. counterparties — normalized payee/merchant entity (the old app just
-- had a free-text Payee field). display_name / normalized_name / kind.
-- ============================================================
-- counterparties(id uuid pk, business_id uuid, display_name text,
--   normalized_name text, kind text null, notes text null, created_at, updated_at)

-- ============================================================
-- 11. integration_sources / sync_runs / source_records — a generic,
-- extensible bank-sync framework (not hardcoded to Tiller specifically),
-- with real sync observability (rows_seen/inserted/updated/skipped,
-- error_summary per run) and a raw-payload staging table
-- (source_records.payload jsonb) before transformation into `transactions`.
-- Confirmed: one integration_sources row already exists, source_type=
-- 'google_sheet', pointing at the real live Tiller/GM Money Google Sheet.
-- This REPLACES the plan's originally-proposed tiller_* mirror tables and
-- the Apps Script "push a full snapshot every 15 min" sync design --
-- needs a fresh design pass reusing THESE tables instead, next session.
-- ============================================================
-- integration_sources(id uuid pk, business_id uuid, source_type text,
--   name text, external_id text, is_active bool, last_synced_at timestamptz null,
--   sync_cursor jsonb, created_at, updated_at)
-- sync_runs(id uuid pk, integration_source_id uuid, status text,
--   started_at timestamptz, finished_at timestamptz null, rows_seen int,
--   rows_inserted int, rows_updated int, rows_skipped int,
--   error_summary text null, reconciliation jsonb null)
-- source_records(id uuid pk, integration_source_id uuid, sync_run_id uuid null,
--   source_entity text, source_record_id text, source_modified_at timestamptz null,
--   payload jsonb, payload_hash text null, imported_at timestamptz)

-- ============================================================
-- 12. account_balance_snapshots — generic replacement for the old app's
-- Tiller "Balance History" sheet read.
-- ============================================================
-- account_balance_snapshots(id uuid pk, business_id uuid, account_id uuid,
--   balance_date date, balance numeric, currency text, source text null,
--   source_record_id text null, raw_source_record_id uuid null, created_at)

-- ============================================================
-- 13. attachments — genuinely new capability (receipt/document uploads
-- against a transaction) not in the old app at all.
-- ============================================================
-- attachments(id uuid pk, business_id uuid, transaction_id uuid,
--   storage_bucket text, storage_path text, file_name text, mime_type text null,
--   byte_size bigint null, uploaded_by uuid null, created_at)

-- ============================================================
-- 14. audit_events — full before/after audit trail (jsonb), anticipating
-- real multi-user accounts. Not wired into anything yet.
-- ============================================================
-- audit_events(id bigint pk, business_id uuid, actor_user_id uuid null,
--   action text, entity_type text, entity_id text, occurred_at timestamptz,
--   before_state jsonb null, after_state jsonb null, request_id text null, source text null)

-- ============================================================
-- STILL MISSING from the adopted schema (this project's job to add):
-- notification_recipients (the old app's per-recipient email prefs have
-- no home here yet -- add when picking up the notifications phase, not
-- needed to unblock login/Dashboard/Register work).
-- ============================================================

-- ============================================================
-- The one statement that's actually new and safe to run right now:
-- ============================================================
create table if not exists gm_money.site_auth (
  id int primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);
