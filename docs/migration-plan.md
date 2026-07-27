# GM Money: migrate off Apps Script/Sheets onto Next.js + Supabase

> **Superseded as of 2026-07-27 — read `HANDOFF.md` first, not this file.**
> This was the original plan, written before it was discovered that a
> different AI session had already built and populated a real schema
> directly in Supabase. The schema DDL and Tiller-sync design below (§
> "Postgres schema" and § "Tiller sync") were never applied — the actual
> adopted schema is documented in `gm-money-web/supabase/schema.sql`, and
> the real, working Tiller sync is `app-script-backend/TillerSync.gs` +
> `gm-money-web/app/api/tiller-sync/route.ts`, not what's described here.
> The auth pattern, general phase structure, and cron-job mechanics below
> are still roughly what was actually built. Kept as a historical record
> of the original thinking, not a current reference.

## Context

GM Money's current architecture (Vite+React frontend calling a Google Apps
Script Web App that reads/writes live Google Sheets on every request) is
too slow in real daily use — Register/Settings can take seconds to tens of
seconds to load, because every request round-trips through Apps Script
hitting live Sheets. The owner wants speed, and also wants GM Money
restructured to match the Next.js + Supabase shape already proven working
in the sibling apps (Skrybix, HydraCloud) rather than patched within the
current shape. This is the single biggest architectural change in this
project's history — a full backend replacement for a real app two people
use daily for actual business bookkeeping — so it's phased, verified at
each step against real data, and cut over deliberately rather than as a
big-bang rewrite.

**Decisions already made (do not re-ask):**
- New Postgres tables live in a dedicated `gm_money` Postgres schema inside
  **HydraCloud's existing Supabase project** (reusing free-tier capacity,
  no new project).
- Email sending for the daily notification digest is **stubbed for now** —
  port the digest's compute/filter logic fully and log what each recipient
  would receive, but don't actually send until a provider is chosen later.
- The new app lives at **`gm-money-web/`, a new folder in this same repo**,
  alongside the existing `gm-money-frontend/` and `app-script-backend/`.
- Proceed autonomously phase-to-phase without pausing for routine check-ins
  — only surface genuine judgment calls (schema ambiguities, anything
  destructive, the actual cutover). The parallel-run window and cutover
  itself (Phase 8) still get an explicit go-ahead before flipping the real
  app two people use daily, per standing safety norms around irreversible
  actions — that isn't optional just because pacing is autonomous.

**What does NOT move**: Tiller (the bank-sync Sheets add-on) only
integrates with Google Sheets — it has no Postgres/API path. Google Sheets
therefore stays permanently in the picture as where Tiller lands bank data;
everything else (all app-owned data) does a one-time cutover to Postgres.

## Repo layout during the migration

```
gm-money-webapp/
  gm-money-frontend/   # KEPT RUNNING untouched until cutover (Phase 8)
  app-script-backend/  # KEPT RUNNING as full API until cutover; trimmed after
  gm-money-web/        # NEW Next.js app — built/verified in parallel, phases 0-7
```

Nobody's daily workflow changes until Phase 8. `app-script-backend` is
trimmed (not deleted) after cutover to just Tiller sync + the
category-write-back helper; `gm-money-frontend` stays in the repo for a
rollback-safety window before removal (Phase 9).

## Postgres schema (`gm_money` schema, HydraCloud's Supabase project)

Reference/lookup tables replace the `Settings` sheet's column-range hack
entirely — `categories.type` becomes a real `check` constraint, making the
Category/Type invariant a database-level guarantee instead of an
application-discipline convention:

```sql
create schema if not exists gm_money;

create table gm_money.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('Income','Expense')),
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

create table gm_money.payment_methods (id uuid primary key default gen_random_uuid(), name text not null unique, sort_order int);
create table gm_money.frequencies (id uuid primary key default gen_random_uuid(), name text not null unique);

create table gm_money.app_config (
  id int primary key default 1 check (id = 1),
  financial_start_date date,
  updated_at timestamptz not null default now()
);

create table gm_money.manual_transactions (
  transaction_id text primary key,               -- keep "MAN-<ts>-<rand4>" format
  date date not null,
  account text not null,
  payee text not null,
  amount numeric(12,2) not null,                  -- signed: negative=expense, positive=income
  category_id uuid references gm_money.categories(id),
  subcategory_id uuid references gm_money.subcategories(id),
  payment_method_id uuid references gm_money.payment_methods(id),
  notes text,
  source text,
  status text not null check (status in ('Uncleared','Cleared')),
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
  transaction_key text primary key,   -- date|description(lower,trim)|amount(2dp)|account(lower,trim)
  subcategory_id uuid references gm_money.subcategories(id),
  notes text,
  review_status text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table gm_money.budgets (
  category_id uuid primary key references gm_money.categories(id) on delete cascade,
  monthly_budget numeric(12,2) not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table gm_money.recurring_transactions (
  schedule_id text primary key,        -- keep "REC-<ts>-<rand4>" format
  payee text not null,
  amount numeric(12,2) not null,
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
  prefs jsonb not null default '{"upcomingBills":true,"overBudget":true,"lowBalance":false,"lowBalanceThreshold":100,"newDeposits":false,"newDepositThreshold":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tiller mirror tables: synced periodically, app never writes these except the
-- one category-registration append (done via Apps Script, see Tiller sync below).
create table gm_money.tiller_transactions (
  transaction_key text primary key,
  date date not null, description text not null, category text,
  amount numeric(12,2) not null, account text not null,
  institution text, categorized_by text, categorized_date timestamptz,
  synced_at timestamptz not null default now()
);
create table gm_money.tiller_categories (name text primary key, synced_at timestamptz not null default now());
create table gm_money.tiller_balance_history (
  account text not null, as_of_date date not null, balance numeric(12,2) not null,
  synced_at timestamptz not null default now(), primary key (account, as_of_date)
);
create table gm_money.tiller_accounts (name text primary key, synced_at timestamptz not null default now());

-- Auth — exact reuse of skrybix-webapp's pattern.
create table gm_money.site_auth (id int primary key default 1 check (id=1), password_hash text not null, updated_at timestamptz not null default now());
```

`notification_recipients.prefs` stays `jsonb` (small, cohesive, always
read-as-a-unit) — the one deliberate exception to "give everything a real
column." Transaction/Schedule IDs keep their existing string format
(`MAN-...`/`REC-...`) rather than switching to bare UUIDs, since historical
`Matched Bank Key`/`Schedule ID` references in migrated data keep working
with zero translation and nobody sees these IDs the way Skrybix's
customer-facing `Cutting_ID`s are seen.

## Tiller sync (the one thing that can't just move to Postgres)

Keep a slimmed `app-script-backend` whose only remaining job (post-cutover)
is a new `TillerSync.gs`, on a **15-minute time trigger**
(`ScriptApp.newTrigger('syncTillerToSupabase').timeBased().everyMinutes(15)`),
reading `Transactions`/`Categories`/`Balance History`/`Accounts` and POSTing
the full current contents as JSON to a new `/api/tiller-sync` Route Handler
in `gm-money-web` (shared-secret header, not the session-cookie gate, since
it's called cross-origin from Apps Script). That route recomputes the
`transaction_key` server-side (never trusts Apps Script's copy) and upserts
into the `tiller_*` tables. Chosen over Next.js pulling from the Sheets API
directly (would need brand-new Google OAuth/service-account setup that
doesn't exist today) or Apps Script pushing straight to PostgREST (splits
all the upsert/dedup logic across two languages instead of one).

**Approving a bank transaction** (Review → categorize) still needs to write
the category into Tiller's own `Transactions`/`Categories` sheets (Tiller's
data-validation only lives there). This becomes: update Postgres
immediately for a fast UI, then a second, best-effort/async call to a
narrow surviving Apps Script endpoint that does the actual
`ensureTillerCategoryExists_`-equivalent write — never blocking the
user-facing approval on a live Sheets round-trip.

## Business logic porting (`gm-money-web/lib/*.ts`)

| Logic | Source today | Approach |
|---|---|---|
| Register dedup + running balance | `Register.gs: buildRegisterEntries_`, `applyRegisterRunningBalance_` | Port near-verbatim as a pure TS function (`lib/register.ts`) — backward-subtract-cleared-sum from current bank balance to derive starting balance, then forward chronological walk. Stays application-layer (not SQL window functions) since the "anchor from today's real balance, walk backward" half doesn't translate cleanly to SQL, and this is the highest-regression-risk piece of logic in the whole migration — give it a real unit test fixture. |
| Category→Type invariant | `Settings.gs: getConfiguredCategoryType_`, `Api.gs: buildTransactionValues_` | Enforced structurally by `categories.type`'s check constraint AND re-derived server-side in a shared helper called from every write path — never accept a client-supplied type/sign. |
| Merchant Memory confidence learning | `MerchantMemory.gs: learnMerchant_`, `normalizeMerchantKey_` | Direct port to `lib/merchantMemory.ts`: +4/cap-100 on repeat match, -12/floor-40 on conflict, replace stored category below the 70 threshold, locked records never auto-update, ≥90 auto-applies in Review/≥70 suggests. Keep the dual-teach behavior (both clean manual payee AND raw bank description on a match) as an explicit two-call sequence. |
| Budget trailing-average suggestions | `Api.gs: getExpenseCategoryTrailingAverages_` | `lib/budgets.ts` — one SQL query for grouped monthly sums, math (divide by months with real data, extrapolate in-progress month) stays in TS. |
| Daily notification digest | `Api.gs: buildNotificationDigestContext_/buildNotificationDigestLinesForPrefs_/sendDailyNotificationDigest_` | `lib/notifications.ts` — port the "compute shared facts once, filter per-recipient by prefs, skip if empty" structure verbatim; **sending is stubbed** (log the composed digest per recipient) until an email provider is chosen. |
| Scheduled transaction generator | `Automation.gs: processDueScheduledTransactionsForSpreadsheet_` | `lib/scheduledTransactions.ts` — direct port of the 24-iteration due-date walk and Uncleared-vs-Needs-Review branching. |

## Cron jobs (Vercel Cron → protected Route Handlers)

```json
// gm-money-web/vercel.json
{ "crons": [
  { "path": "/api/cron/generate-scheduled-transactions", "schedule": "0 3 * * *" },
  { "path": "/api/cron/send-notification-digest",        "schedule": "0 7 * * *" }
]}
```

Same times as today. Routes check `Authorization: Bearer ${CRON_SECRET}`
(Vercel's own convention) and are excluded from the session-cookie
middleware gate, same as `/api/tiller-sync`.

## Auth

Direct reuse of `skrybix-webapp`'s pattern: `lib/session.ts` (HMAC-SHA256
via Web Crypto `crypto.subtle` — same code runs in Edge middleware and Node
Server Actions), `lib/site-auth-db.ts` (bcrypt hash against
`gm_money.site_auth`), `middleware.ts` gating everything except `/login`,
`/api/tiller-sync`, `/api/cron/**`. This replaces GM Money's current
plaintext Script-Properties password check — bcrypt is a correctness fix
that falls out for free, not scope creep — and sets up cleanly for the
already-discussed future real-per-user-accounts milestone.

## Data migration script

`gm-money-web/scripts/import-sheets-data.mjs`, same shape as Skrybix's:
manually-exported CSVs (owner does File → Download → CSV per tab) into a
gitignored `data/sheets-export/`, batch-upserted via `@supabase/supabase-js`.

- **Read `GM_ManualTransactions`'s real column order from the live CSV
  header row, never assume** — this sheet's column order has already
  drifted once in production (a legacy "Business Area" column at index 6,
  real Subcategory appended at index 17). Map by header name only.
- Upsert on natural keys: `manual_transactions`→`transaction_id`,
  `recurring_transactions`→`schedule_id`, `merchant_memory`→`merchant_key`,
  `transaction_meta`→`transaction_key`, `notification_recipients`→`email`.
- Full delete+reinsert (no reliable key, cheap to rebuild): `categories`,
  `subcategories`, `payment_methods`, `frequencies`, `budgets`.
- Dangling-reference handling (mirrors Skrybix's lesson): a
  `manual_transactions.schedule_id` pointing at a since-deleted schedule
  gets a synthesized placeholder `recurring_transactions` row
  (`active=false`, notes flagged) rather than a dropped/nulled reference. A
  category referenced by old transactions but missing from the current
  Settings export gets a synthesized placeholder category too (best-guess
  type from referencing transactions' amount signs), flagged for review.
- Run repeatedly against a scratch copy of the schema while building
  (idempotent via upserts); the final pre-cutover run is what actually
  matters.

## Frontend porting

Most of the just-finished reskin **carries over** — this is a data-layer
re-platform, not a UI rewrite:
- `styles/theme.css` → copies near-verbatim into `gm-money-web/app/globals.css`.
- `layout/Sidebar.tsx`, `DashboardView.tsx`, `TransactionEntryForm.tsx`,
  `CategoryPicker.tsx`, etc. → JSX/CSS structure carries over; only the
  data-fetching layer changes (`callApi()` calls become Server
  Component queries for reads, Server Actions for mutations, following
  `skrybix-webapp/app/mothers/actions.ts`'s exact pattern). `recharts`
  (already a dependency) works unchanged inside a Client Component.
- `src/api/client.ts`'s `callApi`/`ApiResult` — **deleted**. Its whole
  reason to exist (dodging Apps Script's lack of CORS preflight) doesn't
  apply once frontend and backend are the same Next.js app.
- `src/auth/PasswordGate.tsx` (sessionStorage-based) — **replaced** by a
  real `/login` page using the cookie-session pattern above.

## Cutover strategy (Phase 8 — requires explicit go-ahead, not autonomous)

1. **Parallel-run window**: `gm-money-web` fully built, pointed at a
   freshly re-migrated copy of real data, run read-only/side-by-side by the
   owner for a few days of ordinary real use — Register balances/Dashboard
   totals/Budget suggestions must match `gm-money-frontend` line-for-line.
   This is where the running-balance port earns trust before it's load-bearing.
2. **Freeze window (minutes)**: pick a low-activity moment, re-run the
   migration script one final time, switch the bookmark/deploy to
   `gm-money-web`, trim `app-script-backend` to `TillerSync.gs` + the
   category-write-back helper only, disable the old 3am/7am triggers.
3. **Rollback path**: `gm-money-frontend` + full `app-script-backend` stay
   intact (not deleted) through this — rollback is re-enabling the old
   deployment and pointing the bookmark back.
4. **Open question, not blocking**: once Postgres is primary, the two known
   pre-existing Sheets-native bugs (subcategory-wrong-column in
   `Entry.gs: saveEntry()`; sign-based income/expense in
   `Dashboard.gs: getManualDashboardSummary_()`) become moot for the web
   app, but Crystal/Phil might still open the raw Sheet directly — confirm
   with the owner post-cutover whether raw-Sheet access is being retired or
   still needs those fixed.

## Phased roadmap

| Phase | Builds | Verify before moving on |
|---|---|---|
| 0 | `gm-money-web/` Next.js skeleton, `lib/supabase.ts`, env vars pointed at HydraCloud's project | Test Server Action round-trips a `select 1` |
| 1 | Full `gm_money` schema applied to a scratch copy | Manual insert/constraint tests (bad `category_id` fails, etc.) |
| 2 | Auth: session/site_auth/middleware/login, copied from Skrybix | Logged-out redirects everywhere; session persists across reload |
| 3 | Migration script, run repeatedly against scratch schema with real CSV exports | Spot-check real balances/categories/known transactions by eye |
| 4 | `TillerSync.gs` + `/api/tiller-sync`, 15-min trigger, alongside the still-full existing backend | Compare a live Tiller balance to its Postgres mirror |
| 5 | Register (the risky port), Dashboard, Settings/categories, Budgets as Server Components/Actions | Register in `gm-money-web` matches live Sheets Register line-for-line for real history |
| 6 | All write paths: entry, register edits, review/approve (+ Tiller write-back), merchant memory, scheduled CRUD, settings mutations, notification recipients | Manually exercise every one of the 35 original actions' equivalents |
| 7 | Cron routes, full visual port to reskin parity | Manually invoke each cron route; visual diff against current app |
| 8 | Parallel-run window, then the actual cutover (explicit go-ahead required) | A few real days side-by-side; rollback rehearsal before flipping |
| 9 | Cleanup: remove `gm-money-frontend` (after rollback window), trim dead `.gs` files | Housekeeping only |

Real AI co-CFO features and the Reports screen are explicitly **out of
scope** for this migration — building them against a mid-migration system
means building them twice; pick those up once `gm-money-web` is the stable
system of record.

### Critical files to reference while implementing
- `app-script-backend/Register.gs` (399-610) — the running-balance algorithm
- `app-script-backend/MerchantMemory.gs` — confidence-learning thresholds
- `app-script-backend/Settings.gs` — the range layout being replaced
- `app-script-backend/Api.gs` — the 35-action dispatch table (full inventory already done this session)
- `skrybix-webapp/lib/session.ts`, `lib/site-auth-db.ts`, `middleware.ts`, `supabase/schema.sql`, `scripts/import-sheets-data.mjs` — patterns being reused directly

## Verification approach throughout

Every phase's own table above lists its check. General rules: never test
against production Sheets data destructively (scratch schema until the
final pre-cutover migration run); never actually flip real users over
without the explicit Phase 8 go-ahead; build/typecheck (`npm run build` in
`gm-money-web`) after each phase; the Register port specifically needs a
real side-by-side comparison against live data, not just unit tests, given
it's the highest-complexity, highest-trust-required piece of logic being moved.
