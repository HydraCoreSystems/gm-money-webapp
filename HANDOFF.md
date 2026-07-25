# GM Money — Project Handoff / Current State

**Last updated: 2026-07-25.** This file exists so a fresh session (or a
different tool, or a different person) can pick this project up cold,
without depending on chat history or any AI's memory of past sessions.
Update it whenever a phase completes or a real decision gets made — treat
it as the source of truth for "where are we," not a historical log (for the
full chronological history of how the app got here, that lives in Claude's
own memory files, not this repo — this document is a snapshot, not a diary).

---

## 1. Overall goal and scope

"Gathering Moss Financial Center" (GM Money) is a small-business
bookkeeping system for a real plant/hoya business, used daily by the owner
(Phil) and his wife (Crystal) to enter transactions and review the
business's finances. It started as a Google Sheet (Tiller-powered bank
sync + Apps Script automation) and was rebuilt into a real web app over
many sessions. Guiding philosophy, in the owner's own words: **"Money with
modern amenities"** — it should feel like a spiritual successor to
Microsoft Money (nested category tree, unified transaction ledger,
at-a-glance dashboard), not a generic budgeting app, but with a genuinely
modern, polished, visually rich 2020s interface and increasingly real AI
intelligence behind it (a "co-CFO," not just a form that stores numbers).

**Current top-level goal (active as of 2026-07-25): migrate the entire
backend off Google Apps Script + Google Sheets onto Next.js + Supabase
(Postgres)**, because the Apps Script version is too slow in real daily
use (Register/Settings can take seconds to tens of seconds to load). This
is happening in parallel with the old app — nobody's daily workflow
changes until a deliberate, explicit cutover (see §9).

---

## 2. Current architecture — TWO systems exist right now, side by side

### 2a. The OLD system (still live, still what Phil/Crystal use daily)

```
gm-money-frontend/   Vite + React + TypeScript SPA
app-script-backend/  Google Apps Script Web App (Api.gs = single doPost dispatch point, 35 actions)
                     backed by a real Google Sheet + Tiller (bank sync add-on)
```

- Frontend calls `callApi<T>(action, payload)` (`gm-money-frontend/src/api/client.ts`),
  which POSTs `{action, password, payload}` as `text/plain` (deliberately —
  keeps it a CORS "simple request" since Apps Script Web Apps can't handle
  preflight) to `VITE_GM_API_URL`.
- Auth: one shared password, stored in Apps Script Script Properties
  (`GM_API_PASSWORD`), checked server-side on every request, plain-text
  equality (no hashing).
- Deployed: Vercel project `gm-money-webapp` (Root Directory =
  `gm-money-frontend`), auto-deploys on push to `main`. Apps Script backend
  deployed via `clasp` (already authenticated on this machine).
- **This system is fully functional and in daily use — do not break it
  while working on the migration.** It only gets touched/decommissioned at
  the explicit cutover step (§9), not before.

### 2b. The NEW system (in progress, not live yet, not used by anyone)

```
gm-money-web/   Next.js 14 (App Router) + React 18 + TypeScript
                Supabase Postgres (schema: gm_money, inside HydraCloud's
                existing Supabase project — see §6 for why)
```

- No separate backend — Next.js Server Actions/Server Components/Route
  Handlers ARE the backend, querying Supabase directly via
  `@supabase/supabase-js` (no ORM), using the **service-role key,
  server-side only** (never exposed to the browser).
- Auth: ported near-verbatim from the sibling `skrybix-webapp` repo —
  bcrypt-hashed password in `gm_money.site_auth`, HMAC-SHA256-signed
  session cookie via Web Crypto (`crypto.subtle`, so identical code runs
  in Edge middleware and Node Server Actions), `middleware.ts` gates every
  route except `/login`, `/api/tiller-sync`, `/api/cron/**`.
- Not yet deployed anywhere (no Vercel project created for it yet — that's
  an upcoming task, not done).
- **Tiller cannot integrate with Postgres at all — it only writes to
  Google Sheets.** So Google Sheets stays permanently in the picture as
  where Tiller lands bank data. The plan (see §8) keeps a slimmed-down
  `app-script-backend` alive forever, purely as a sync bridge pushing
  Tiller's sheets into Postgres mirror tables every 15 minutes — everything
  else (all app-owned data) does a one-time cutover to Postgres and never
  touches Sheets again.

---

## 3. Completed features

### On the OLD system (all shipped, all live in production today)
1. Transaction entry (password gate, Phil/Crystal "who" picker, real
   nested Income/Expense category picker)
2. Register (unified ledger: manual + bank-fed transactions deduplicated,
   running balance computed backward-then-forward from the real bank
   balance) — full CRUD, not just view-only
3. Review (bank-fed transactions get categorized, auto-registers new
   categories into Tiller's own separate Categories sheet)
4. Dashboard (cash position, income/expenses this month, spending-by-category
   pie chart, budget progress bars with pace warnings, account balances,
   recent transactions)
5. Settings (categories/subcategories/payment methods CRUD, budgets)
6. Scheduled/recurring transactions (CRUD + a daily 3am auto-generator)
7. Merchant Memory (confidence-scored auto-categorization learning)
8. Budgeting (data-driven suggestions from real trailing spending history,
   not guessed cold; over-budget pace warnings)
9. Email notifications (daily digest, per-recipient preferences, via
   Apps Script's free `MailApp`)
10. **Full visual redesign** (2026-07-25, same session that started the
    migration): sidebar shell replacing the old top-tab nav, a new
    forest/sage/amber design-token system modeled on a sibling app's
    ("Gathering Moss Marketplace") visual language, a real nested
    Income/Expense category picker with search (replacing native
    `<optgroup>` selects), a Light/Dark/System theme toggle in Settings.

### On the NEW system (`gm-money-web/`) — Phase 0-1 only, just started
- Next.js skeleton, styled identically to the just-redone old app
  (`theme.css` copied verbatim into `app/globals.css`).
- Full auth stack: login page (with the Phil/Crystal picker preserved),
  session cookie, self-service change-password page.
- Full Postgres schema **written** (`gm-money-web/supabase/schema.sql`) but
  **application to the real database is not yet confirmed complete** — see
  §7 "Immediate blocking issue."
- A one-time bootstrap script (`scripts/seed-site-auth.mjs`) to set the
  first password, since there's no signup flow.

---

## 4. In-progress / missing

Everything else in the approved migration plan (see §8 for the phase
list) — the new system currently has **zero real data, zero business
logic ported, and cannot be used for anything real yet.** Specifically
still to build: the Tiller sync mechanism, Register's dedup/running-balance
algorithm, Dashboard, all 35 original actions' equivalents as Server
Actions, cron jobs for the daily scheduled-transaction generator and
notification digest, the real data migration (Sheets → Postgres), the
parallel-run verification window, and the actual cutover.

Beyond the migration, explicitly deferred (not started, not scoped in
detail yet):
- **Real AI "co-CFO" features** — an actual Claude API call for narrative
  financial guidance (the owner's stated real reason for wanting this
  rebuilt with Claude at all, per `CLAUDE.md`'s "AI / intelligence
  direction" section). Needs an Anthropic API key + the owner's sign-off on
  ongoing per-call cost before implementation starts.
- **Reports screen** — never scoped in detail, the last item on the
  original (pre-migration) milestone list.
- **Two known pre-existing bugs in the ORIGINAL Sheets-native code**
  (already fixed in the Apps Script API layer, never fixed in the raw
  Sheets functions): `Entry.gs: saveEntry()` writes Subcategory to the
  wrong column; `Dashboard.gs: getManualDashboardSummary_()` derives
  Income/Expense from the amount's sign instead of the category's type.
  Open question for the owner: does raw-Sheets-UI access still matter once
  Postgres is primary, or is it being retired entirely?
- **Real per-user accounts** (not the current single shared password) —
  explicitly the eventual target for GM Money AND both sibling apps
  (HydraCloud, Skrybix), per the owner's 2026-07-23 direction. Not started.
  Should be self-registration (each person sets their own username/password
  on first login), not admin-provisioned, per the owner's explicit
  preference.
- Real (non-stubbed) email sending for the notification digest — provider
  not yet chosen (owner said "skip for now" when asked; the digest logic
  itself should still be fully ported, just log instead of send).
- A Vercel project for `gm-money-web` — not created yet.

---

## 5. Important constraints, decisions, and data model rules (do not relitigate without a real reason)

**These are load-bearing. Getting any of these wrong once already caused
real bugs in this project's history — see §7 "Known bugs" below.**

1. **Category → Type is a hard invariant.** Type ("Income"/"Expense") is a
   property of the Category only, NEVER independently settable, and never
   accepted as client-supplied input — it's always derived server-side from
   the category. In the new Postgres schema this is now a database-level
   `check` constraint (`gm_money.categories.type`), not just an
   application-discipline convention.
2. **Tiller integration cannot move to Postgres.** Tiller only writes to
   Google Sheets. Approving a bank transaction must still register the
   category into Tiller's own separate `Categories` sheet (its own
   validation list, unrelated to GM Money's own Settings categories) before
   writing it into a bank transaction's Category column, or Tiller silently
   rejects the write.
3. **Register's running-balance algorithm** (the most complex logic in the
   whole system): walk BACKWARD from the current real bank balance
   (subtracting every currently-cleared entry) to derive the implied
   starting balance, then walk FORWARD chronologically through cleared +
   uncleared entries assigning each a running balance. A manual entry with
   a "Matched Bank Key" suppresses its corresponding bank-fed row from also
   appearing (dedup). This must be ported as a real algorithm, not
   reinvented — see `app-script-backend/Register.gs` lines 399-610.
4. **Merchant Memory confidence learning**: +4 confidence on a repeat match
   to the same category (cap 100), −12 on a conflicting category (floor
   40; below the 70 "replacement threshold" the stored category gets
   overwritten), locked records never auto-update, ≥90 confidence
   auto-applies a category in Review, ≥70 merely suggests it. When a manual
   transaction is later matched to a bank transaction, teach BOTH the
   clean manual payee text AND the messy raw bank description (a real past
   bug: only teaching the clean side meant the ugly bank text was never
   recognized next time).
5. **Budget suggestions use real trailing spending data**, not a guess —
   average up to 3 trailing months per category, divide by however many
   months actually had real data (not a fixed divisor), extrapolate the
   in-progress current month via `spend-so-far × daysInMonth/dayOfMonth`.
6. **`GM_ManualTransactions`'s column order has already drifted once in
   production** — a legacy "Business Area" column sits at index 6, the real
   Subcategory column was appended at index 17 instead of where any
   documentation implies. Any code reading this sheet (including a future
   migration script) must map columns by header name, never by fixed index.
7. **The Settings sheet is column-range based, not row-based** — several
   independent lists (Categories A4:C100, Payment Methods D4:D100,
   Transaction Types F4:F20, Frequencies H4:H20) share the same physical
   rows. Never `deleteRow`/`insertRow` on it (shifts every other column's
   independent list) — this whole problem disappears in the new Postgres
   schema, which is exactly why it's worth finishing the migration rather
   than patching this in place.
8. **Design system**: forest/sage/amber palette, Georgia display serif +
   Inter body font, defined as CSS custom properties in
   `gm-money-frontend/src/styles/theme.css` (and copied verbatim into
   `gm-money-web/app/globals.css`). Gradients and real visual depth/richness
   are explicitly WANTED (not old Microsoft-Money-style flatness) — see
   `CLAUDE.md`'s "Design language" section for the full brief.
9. **The three sibling apps** (GM Money, HydraCloud, Skrybix) are meant to
   converge toward the same visual language and the same Next.js + Supabase
   architecture pattern over time — decisions made in one should generally
   be checked against/reused in the others, not reinvented per-app.

---

## 6. Why HydraCloud's Supabase project specifically

The owner has already used both of his free Supabase project slots (one
for Skrybix, one for HydraCloud) and does not want to pay for a third. GM
Money's new Postgres tables therefore live inside a **dedicated `gm_money`
schema inside HydraCloud's existing Supabase project** (project ref
`qptipjjribhwjjakmwjx`) — chosen over Skrybix's project when asked
directly. A dedicated schema (not `public`) means GM Money's tables can
never collide with HydraCloud's own `public.*` tables in the same project.

---

## 7. Known bugs, blockers, and the immediate next step

### Immediate blocking issue (as of this update)
`gm-money-web/supabase/schema.sql` was pasted into Supabase's SQL Editor
for the HydraCloud project and run, but errored with
`ERROR: 42P07: relation "categories" already exists`. This almost
certainly means the script was run twice (the first run likely succeeded
completely — `create schema if not exists` is idempotent, but plain
`create table` is not, so a second run fails immediately at the very first
table). **Needs confirmation, not assumption** — run this exact read-only,
100%-safe query in the same SQL Editor and check the output against the 16
tables schema.sql defines:

```sql
select table_name from information_schema.tables where table_schema = 'gm_money' order by table_name;
```

Expected full list (16 tables) if the first run succeeded completely:
`app_config, budgets, categories, frequencies, manual_transactions,
merchant_memory, notification_recipients, payment_methods,
recurring_transactions, site_auth, subcategories, tiller_accounts,
tiller_balance_history, tiller_categories, tiller_transactions,
transaction_meta`

If any are missing, re-run only the `create table` statements for the
missing ones (skip `create schema if not exists gm_money;` — already
applied — and skip any table that already exists, or you'll hit the same
error again).

### Separate, definitely-not-done-yet blocker
**`gm_money` has not yet been added to Supabase's exposed schemas.**
Confirmed directly via a live `curl` to the project's REST API just now —
every table request returns `PGRST106: Invalid schema: gm_money`,
regardless of whether the tables themselves exist. This is a **separate
dashboard setting** from running the SQL: **Settings → API → Exposed
schemas** (sometimes shown under "Data API") → add `gm_money` → Save. The
app cannot query anything at all until this is done, independent of
whether the table-creation issue above is resolved.

### Other known issues, lower priority
- `npm install` in `gm-money-web` surfaces 2 high-severity `npm audit`
  findings — inherited from the same pinned Next.js 14.2.x version range
  already used by Skrybix and HydraCloud (not introduced fresh here).
  Fixing means bumping to Next.js 16 across all three sibling apps
  consistently — a cross-cutting decision to raise with the owner
  separately, not something to fix unilaterally mid-migration.
- No Vercel project exists yet for `gm-money-web` — needs creating
  (Root Directory = `gm-money-web`, same repo) once there's something
  real worth previewing live, not urgent yet.

---

## 8. Next concrete tasks, in order

1. **Resolve the schema-application ambiguity above** — run the diagnostic
   query, fix any partially-applied state.
2. **Confirm `gm_money` is added to Supabase's exposed schemas** (dashboard
   step, owner must do it — no API/SQL way to do this from code).
3. Once both are confirmed: run `npm run seed-site-auth` inside
   `gm-money-web/` (can be done by Claude directly — it's just a script
   hitting the already-configured Supabase REST API, not a dashboard
   action) to bootstrap the first password, then verify login end-to-end
   in a browser.
4. Continue through the full phased plan (schema ✅ almost done → auth ✅
   mostly done → **migration script** → **Tiller sync** → **Register +
   Dashboard + Settings + Budgets ported** → **all write paths ported** →
   **cron jobs + visual parity polish** → **parallel-run verification
   window** → **actual cutover, explicit go-ahead required** → **cleanup**).
   **The full detail for every one of these phases (exact schema, exact
   file layout, exact algorithm-porting approach, exact cutover strategy)
   is written out in full in the approved plan — see §10 below for where
   that lives and why it should probably be copied into this repo.**

---

## 9. Cutover rule (do not skip this even under time pressure)

`gm-money-frontend` + `app-script-backend` stay fully intact and are what
Phil and Crystal actually use for real bookkeeping, for the entire
duration of this migration. Do not disable, break, or repoint them until:
(a) `gm-money-web` has been run side-by-side (read-only comparison) against
real data for a real verification window and matches line-for-line
(especially Register's running balance — the single highest-regression-risk
piece of logic being ported), AND (b) the owner has given an **explicit
go-ahead** for the actual flip. This is the one step in the whole migration
that is NOT meant to happen autonomously/without a check-in, regardless of
how the rest of the work is paced.

---

## 10. Files, APIs, and config needed to continue — full reference list

### Repo layout (this repo, `gm-money-webapp`)
```
CLAUDE.md                          -- project charter: philosophy, full data model, design language, AI direction. READ THIS FIRST for anything not covered here.
HANDOFF.md                         -- this file
gm-money-frontend/                 -- OLD live frontend (Vite+React), DO NOT BREAK
  src/api/client.ts                -- callApi()/ApiResult<T> — the old API contract
  src/styles/theme.css             -- design tokens, source of truth (copied into gm-money-web/app/globals.css)
  src/layout/Sidebar.tsx           -- sidebar shell (port into gm-money-web later)
  src/features/dashboard/DashboardView.tsx
  src/features/transaction-entry/CategoryPicker.tsx  -- the new nested picker
  src/features/*/                 -- one folder per screen (register, review, scheduled, merchant-memory, settings)
app-script-backend/                -- OLD live backend (Apps Script), DO NOT BREAK
  Api.gs                           -- single doPost dispatch point, 35 actions, START HERE for porting any logic
  Register.gs                     -- the running-balance algorithm (lines 399-610)
  Settings.gs                     -- the column-range Settings sheet logic being replaced
  MerchantMemory.gs               -- confidence-learning algorithm
  Automation.gs                   -- scheduled-transaction daily generator
  Transactions.gs                 -- Tiller category-registration write-back logic
gm-money-web/                      -- NEW system, in progress
  supabase/schema.sql              -- full Postgres DDL (source of truth for the schema)
  lib/supabase.ts                  -- Supabase client, scoped to gm_money schema
  lib/session.ts, lib/site-auth-db.ts, middleware.ts  -- auth (ported from skrybix-webapp)
  app/login/, app/settings/password/  -- login + change-password pages
  scripts/seed-site-auth.mjs        -- one-time first-password bootstrap
  .env.local                       -- SECRETS, gitignored, not in this handoff — see below
```

### Sibling repos referenced as patterns (read, don't modify unless asked)
```
C:\Users\pwach\OneDrive\Desktop\skrybix-webapp\lib\session.ts           -- auth pattern source
C:\Users\pwach\OneDrive\Desktop\skrybix-webapp\lib\site-auth-db.ts
C:\Users\pwach\OneDrive\Desktop\skrybix-webapp\middleware.ts
C:\Users\pwach\OneDrive\Desktop\skrybix-webapp\supabase\schema.sql       -- schema-file convention (hand-applied, no migration tool)
C:\Users\pwach\OneDrive\Desktop\skrybix-webapp\scripts\import-sheets-data.mjs  -- CSV-import pattern to replicate for GM Money's own migration script
C:\Users\pwach\OneDrive\Desktop\gathering-moss-marketplace\              -- private repo, the visual-design reference the whole 2026-07-25 reskin was modeled on
```

### Required environment variables (already set in `gm-money-web/.env.local`, gitignored — not reproduced here since they're secrets; if this file is ever missing, regenerate per below)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — HydraCloud's Supabase
  project (Settings → API in that project's dashboard has both).
- `AUTH_SECRET` — any long random string, used to sign session cookies.
- `CRON_SECRET` — any long random string, checked by the cron API routes.
- `TILLER_SYNC_SECRET` — any long random string, checked by `/api/tiller-sync`
  (route not built yet).

### External accounts/access needed to continue this work
- **Supabase dashboard access** (HydraCloud project) — for schema
  application, exposed-schema settings, and eventually checking real
  capacity/usage. No AI agent has direct dashboard login; these steps
  need the owner.
- **Vercel account** ("Gathering Moss" team) — already used for
  `gm-money-frontend`; a new project will be needed for `gm-money-web`
  eventually (Root Directory = `gm-money-web`).
- **Google Apps Script project** (`app-script-backend`) — `clasp` is
  already authenticated on this machine (tied to
  gatheringmossphil@gmail.com), so redeploys don't need dashboard
  clicking.
- **The real Google Sheet + Tiller** — this is the actual live bookkeeping
  data; the migration script (not yet built) will need real CSV exports
  from it (File → Download → CSV per tab), done manually by the owner.

### Outstanding assumptions / open questions nobody has answered yet
1. Whether raw-Sheets-UI access matters post-cutover (affects whether the
   two known legacy Sheets bugs are worth fixing there too).
2. Which email-sending provider to use once "skip for now" is revisited.
3. Exact timing/cadence the owner wants for the parallel-run verification
   window before cutover (not yet discussed — "a few days" was the plan's
   own suggestion, not confirmed with the owner).
4. Whether the Next.js 14 → 16 version bump (to clear the npm audit
   findings) should happen across all three sibling apps together, and if
   so, when.

---

## 11. Where the full detailed migration plan lives (important)

The complete phase-by-phase plan (exact schema DDL, exact Tiller-sync
design, exact business-logic porting table, exact cron job config, exact
cutover steps) was written and approved this session. It originated at
`C:\Users\pwach\.claude\plans\moonlit-percolating-lark.md` (Claude Code's
own local plan storage, not visible to a fresh session/different
machine/different tool) and has now been **copied into this repo at
[`docs/migration-plan.md`](docs/migration-plan.md)** specifically so it
survives independent of any AI session or tool. That file is the most
granular reference (exact SQL, exact Vercel Cron JSON) — this HANDOFF.md
is the higher-level summary; `docs/migration-plan.md` is the detailed
execution reference underneath it.
