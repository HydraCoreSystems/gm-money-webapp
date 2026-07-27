# GM Money — Project Handoff / Current State

**Last updated: 2026-07-27 (major rewrite — the previous version, from
2026-07-25, predated an entire other AI session plus this whole session's
work; see §2b/§3/§7 for what actually changed).** This file exists so a
fresh session (or a different tool, or a different person) can pick this
project up cold, without depending on chat history or any AI's memory of
past sessions. Update it whenever a phase completes or a real decision
gets made — treat it as the source of truth for "where are we," not a
historical log.

---

## 1. Overall goal and scope

"Gathering Moss Financial Center" (GM Money) is a small-business
bookkeeping system for a real Whatnot/plant-adjacent resale business, used
daily by the owner (Phil) and his wife (Crystal) to enter transactions and
review the business's finances. It started as a Google Sheet
(Tiller-powered bank sync + Apps Script automation) and is being rebuilt
into a real web app. Guiding philosophy, in the owner's own words: **"Money
with modern amenities"** — a spiritual successor to Microsoft Money
(nested category tree, unified transaction ledger, at-a-glance dashboard),
with a genuinely modern, polished, visually rich interface and increasing
real AI intelligence behind it. As of this session the app is branded
**"GM Money 2026"** (owner's own naming, in tribute to Microsoft Money's
old "product + year" convention) — see the Sidebar lockup, browser tab
title, and PWA manifest.

**The migration off Google Apps Script + Sheets onto Next.js + Supabase is
now deployed to production and in active real use** — this session was
almost entirely Crystal/Phil using `gm-money-web` for actual bookkeeping
and reporting real bugs as they hit them, not a side-by-side test. See §9
for an important open question this raises about the old system.

---

## 2. Current architecture

### 2a. The OLD system (`gm-money-frontend` + `app-script-backend`)

```
gm-money-frontend/   Vite + React + TypeScript SPA
app-script-backend/  Google Apps Script Web App (Api.gs = single doPost dispatch, 35 actions)
                     backed by a real Google Sheet + Tiller (bank sync add-on)
```

Still exists in this repo, untouched in its own logic except for one
addition this session: **`TillerSync.gs`** (new file, pushed via `clasp`)
that reads Tiller's own `Transactions`/`Balance History` sheets and POSTs
to the new system's `/api/tiller-sync` on a 15-minute trigger — see §2b.
Whether Phil/Crystal still use the raw Sheets UI directly at all anymore
is now an open question (§9), not something to assume either way.

### 2b. The NEW system (`gm-money-web/`) — deployed, live, in real use

```
gm-money-web/   Next.js 14 (App Router) + React 18 + TypeScript
                Supabase Postgres (schema: gm_money, inside HydraCloud's
                existing Supabase project, ref qptipjjribhwjjakmwjx)
```

- **Live in production**: `https://gm-money-web.vercel.app` (Vercel
  project `gm-money-web`, team `gathering-moss`). Deploys are **manual**
  — `vercel --prod` run directly from this machine, not a git-push-triggered
  auto-deploy. **After any code change, both a git push AND a `vercel --prod`
  run are required** — pushing to GitHub alone does not deploy.
- No separate backend — Next.js Server Actions/Server Components/Route
  Handlers ARE the backend, querying Supabase via `@supabase/supabase-js`
  (service-role key, server-side only).
- **Schema**: the `gm_money` schema was originally built and populated by
  a *different* AI session (OpenAI's Codex, working via `AGENTS.md` — a
  near-duplicate of this file's sibling `CLAUDE.md`, discovered this
  session) before this repo's own from-scratch schema plan was ever
  applied. It's a real, multi-tenant-ready design (`businesses`, unified
  `transactions` table with `source` discriminator, `transaction_matches`,
  `merchant_rules`, `recurring_transactions`, `account_balance_snapshots`,
  etc.) — see `gm-money-web/supabase/schema.sql` for the documented
  (reverse-engineered) shape and `gm-money-web/supabase/migrations/` for
  every additive change made on top of it.
- **Auth is REAL per-user accounts now** — this reached the "eventual
  target" milestone described in `CLAUDE.md`'s Auth section (not just a
  single shared password anymore). `gm_money.app_users` (bcrypt password
  hashes, `owner`/`admin`/`member` roles), `/setup` self-registers the
  first owner account, `/settings/users` adds more. Session cookie is
  HMAC-SHA256-signed via Web Crypto (`lib/session.ts`), same pattern as
  `skrybix-webapp`. `middleware.ts` gates everything except
  `/login`, `/setup`, `/api/health`, `/api/tiller-sync`, `/api/cron/**`,
  and the PWA assets (`icon.png`, `apple-icon.png`,
  `manifest.webmanifest` — these must stay reachable without a session
  since browsers/iOS fetch them unauthenticated).
- **Tiller sync is real and running** — `TillerSync.gs` pushes to
  `/api/tiller-sync` every 15 minutes; the route upserts idempotently
  (on `business_id, source, source_record_id` for transactions; a
  synthesized `${account_id}|${balance_date}` key for balance snapshots,
  routed through a *pre-existing* constraint on that table that wasn't
  documented anywhere — see §5 for the exact gotcha) and enforces
  `CUTOFF_DATE` server-side regardless of what the sender includes (a real
  bug found and fixed this session — see §7).
- **PWA / mobile**: `/lite` is a stripped-down, phone-first view (account
  balances + the entry form only, no Sidebar/Register/Settings/etc.) meant
  to live on Crystal's iPhone home screen. `app/manifest.ts` +
  `appleWebApp` metadata in `app/layout.tsx` + real `icon.png`/
  `apple-icon.png` (hand-encoded PNGs — Next's dynamic `icon.tsx`
  convention crashes on Windows, a `@vercel/og` bug unrelated to this app)
  make "Add to Home Screen" open full-screen with a real branded icon.
  `start_url` in the manifest points at `/lite`.
- **AI advisor is real and live**, not just planned. Two tiers, both
  built:
  1. **Co-CFO Insights** (`lib/advisor.ts`) — free, data-driven (runway,
     month-end pace, category concentration, review-queue health, 7-day
     trend), always rendered on the Dashboard, no API cost.
  2. **Ask GM Money** (`lib/ai-advisor.ts`, `app/api/ai/advice/route.ts`)
     — a real LLM call, on-demand only (fires when a question is actually
     submitted, not on page load). **Uses OpenAI (`gpt-4o-mini`), not
     Anthropic** — `OPENAI_API_KEY`/`OPENAI_MODEL` are set in Vercel
     Production. This was wired in by the other AI session without an
     explicit recorded cost sign-off from the owner (per `CLAUDE.md`'s
     rule that a real model call needs that first); when raised with him
     this session he chose to keep it as-is rather than switch/remove it
     — treat that as the sign-off going forward, but the vendor choice
     (OpenAI vs. Anthropic) was never a deliberate decision, just what the
     other AI defaulted to.
  Logged to `gm_money.ai_advice_log` with outcome tracking (mark a past
  answer as followed/not-followed, with a note).

---

## 3. Completed features

### On the OLD system (Sheets/Apps Script) — unchanged this session
Transaction entry, Register, Review, Dashboard, Settings, Scheduled,
Merchant Memory, data-driven Budgeting, email notifications (via
`MailApp`), full visual redesign. See the previous version of this file
(git history) for the detailed list — not repeated here since focus has
shifted to the new system.

### On `gm-money-web/` — the real current state
- **Auth**: real per-user accounts, `/setup`, `/login`, `/settings/users`,
  `/settings/password`. See §2b.
- **Dashboard**: account balances, income/expenses this month (floored at
  `CUTOFF_DATE`, not calendar-month-start), 30-day cashflow chart
  (Recharts `AreaChart`, real gradient fills), Expense Constellation pie
  chart (Recharts `PieChart`/`Pie`/`Cell` — see §7 for a real rendering
  bug found and fixed here), Co-CFO Insights + Ask GM Money (§2b), a "Last
  Tiller Sync" status tile, recent activity list.
- **Register**: unified ledger, backward-then-forward running balance,
  manual/bank dedup (explicit `transaction_matches` rows + a same-account/
  same-amount/within-7-days/shared-word heuristic for unconfirmed pairs).
  **Real reconciliation UI** (built this session): a manual entry with a
  detected-but-unconfirmed bank counterpart shows the *actual* candidate
  bank row (not just a text description) so the user can visually compare
  before confirming; confirming permanently links them
  (`transaction_matches`, `match_method='manual'` — see §5 for why not
  `'manual_confirm'`) and marks the manual entry Cleared. Bank-fed rows
  are always treated as Cleared (computed at read time, not trusted from
  the stored column — see `lib/register.ts`'s `effectiveStatus()`).
  Manual-entry delete button (source=`sheet_manual` only, confirms before
  deleting).
- **Entry**: nested Income/Expense category picker with inline
  category/subcategory creation, optional recurring-schedule creation
  alongside a one-time entry.
- **Review**: bank-fed transaction categorization queue.
- **Scheduled**: recurring transactions CRUD, a real calendar view with a
  colored dot on due dates, daily auto-post (cron) + "run now" button.
- **Merchants**: merchant memory management (confidence-scored
  auto-categorization).
- **Settings**: categories, budgets, notification recipients (per-
  recipient prefs — digest computation exists, **actual email sending is
  still stubbed**, nobody has picked a provider), password, users.
- **Tiller sync**: real, running, idempotent (§2b, §7).
- **PWA/`/lite`**: real installable mobile view (§2b).
- **Visual design**: a full "premium" pass this session — bold
  jewel-tone chart colors with gradient fills and glow-on-hover, gradient
  buttons/cards/badges app-wide, a richer Sidebar (glow, gradient active
  state, accent bar), gradient/glow standalone-card treatment on
  Login/Setup. Rebranded as **"GM Money 2026"** (Sidebar lockup, browser
  tab title, Apple home-screen title, PWA manifest name — deliberately
  *not* the manifest's `short_name`, which stays "GM Money" so it doesn't
  truncate under a phone home-screen icon). The actual business name
  ("Gathering Moss") is untouched everywhere it appears as business
  context (breadcrumbs, the database lookup in `lib/supabase.ts`) — only
  the app's own product identity changed.
- **Data**: the ~2 years of originally-migrated transaction history was
  **deliberately purged** this session at the owner's explicit request
  for a clean slate — `CUTOFF_DATE = "2026-07-19"` (`lib/dashboard.ts`,
  exported and reused, not re-hardcoded elsewhere). Only 44 transactions
  existed right after the purge; real activity has grown since via the
  now-working Tiller sync. The Google Sheet still has the full history —
  nothing was lost, just no longer duplicated in Postgres. **The receiving
  endpoint enforces this cutoff itself** (§7) so a sync misconfiguration
  can't silently repopulate old data again.
- **Version control**: everything above — the other AI's entire session
  plus this session's work — is now actually committed and pushed to
  GitHub (`HydraCoreSystems/gm-money-webapp`, `main`). It was NOT before
  this session started (see §7) — deploys had been happening straight to
  Vercel with no git history at all, which was a real risk (no rollback
  safety, GitHub silently out of sync with what was actually live).

---

## 4. In-progress / missing

- **Notification digest emailing** — prefs UI and per-recipient
  compute logic exist; nothing actually sends an email yet. No provider
  chosen.
- **Real AI co-CFO vendor decision** — currently OpenAI, not Anthropic
  (see §2b). The owner was asked directly this session whether to switch;
  he chose to leave it as-is since it's cheap and already working. Not
  revisit unless he raises it again.
- **Retail pricing guide** — the owner asked how hard this would be
  (an AI-assisted "what should I charge for this item" tool). Discussed,
  not built. The easy version (a form + an LLM call, reusing the existing
  `lib/ai-advisor.ts` infrastructure) vs. the harder version (grounded in
  real historical cost/margin data) was discussed — there's currently no
  "product" concept anywhere in this schema at all, so the grounded
  version needs real scoping before starting.
- **Reports screen** — never scoped in detail.
- **Two known pre-existing bugs in the ORIGINAL Sheets-native code**
  (`Entry.gs: saveEntry()` subcategory-wrong-column;
  `Dashboard.gs: getManualDashboardSummary_()` sign-based income/expense) —
  still open, still unresolved, still gated on the open question in §9
  about whether raw-Sheets access matters going forward.
- **Next.js 14 → 16 bump** — not done, still a cross-sibling-app decision
  to raise with the owner, not something to do unilaterally.
- **Merchant-memory rebuild after the data purge** — `rebuildMerchantRules()`
  exists and scans all categorized transactions to (re)learn confidence
  scores; nobody has needed to run it since the purge (existing
  `merchant_rules` rows were untouched by the purge, they're independent
  of transaction history), but worth knowing it would now learn from a
  much thinner dataset if ever re-run.
- **The empty-`transaction_matches`-table mystery** — at one point this
  session the table was found completely empty when 4 rows were expected
  to still exist (verified via direct query, not a caching illusion).
  It's stable and correct now, and doesn't appear to be recurring, but the
  root cause was never identified. Worth a raised eyebrow if match rows
  ever seem to vanish again.

---

## 5. Important constraints, decisions, and data model rules

**Everything from the previous version of this file still applies**
(Category→Type invariant, Tiller's Categories-sheet write-back
requirement, the Register running-balance algorithm, Merchant Memory's
confidence math, budget-suggestion math, the Settings sheet's column-range
fragility, the shared design system, the three-sibling-apps convergence
goal). Additions from this session:

1. **`transaction_matches.match_method` has a check constraint whose
   allowed values aren't documented anywhere and aren't exposed via
   PostgREST** (no error detail beyond "violates check constraint"; the
   table had no surviving rows to infer from when this was hit). Confirmed
   empirically: `'manual'` is accepted. Don't guess a "more descriptive"
   value without testing first — it will fail with a generic constraint
   error, not a helpful one.
2. **`account_balance_snapshots` has a pre-existing unique constraint on
   `(business_id, source, source_record_id)` from the originally-adopted
   schema** that isn't obvious from the column list alone. The Tiller sync
   route upserts against this constraint using a synthesized
   `${account_id}|${balance_date}` as `source_record_id` — do not go back
   to leaving `source_record_id` null for new snapshot rows, or every
   account after the first one synced in a given run will collide against
   the same `(business_id, source, null)` slot (a real bug hit and fixed
   this session).
3. **Bank-fed (`source='tiller'`) transactions are always Cleared**,
   computed at read time in `lib/register.ts`'s `effectiveStatus()`, never
   trusted from the stored `status` column. A manual entry only becomes
   Cleared by being explicitly matched to its bank counterpart via
   `app/register/actions.ts`'s `matchToBank()` — there's no other path to
   Cleared for a manual entry. This mirrors how the old Sheets app
   actually worked (bank data was never independently "uncleared").
4. **Concurrent Supabase queries via `Promise.all` on the same client
   instance could silently return an empty result for one of them** — no
   error, no exception, just wrong data. Confirmed live (a temporary
   side-by-side diagnostic proved a raw `fetch()` to the identical
   endpoint, in the same execution, returned correctly while the
   supabase-js call didn't). Root cause suspected to be Next.js's fetch
   caching/deduplication layer interfering, not fully proven. Fixed at the
   client-factory level (`lib/supabase.ts` now forces every request
   through with `cache: "no-store"` explicitly, regardless of which fetch
   implementation supabase-js resolves internally) plus de-parallelized
   the two queries in `lib/register.ts` specifically as defense in depth.
   **If something similar (right query, wrong/empty result, no error) is
   ever seen again anywhere else that uses `Promise.all` with Supabase
   queries, this is the first thing to suspect.**
5. **Recharts 3.10.0's animated `Pie`/`Sector` rendering can silently
   paint nothing** — confirmed live: with `isAnimationActive` on, every
   `recharts-pie-sector` group rendered completely empty (no `<path>` at
   all). Disabling animation on the `Pie` specifically fixed it
   immediately; the `AreaChart` on the same dashboard animates fine, so
   this isn't a broader library problem, just Pie/Sector animation in this
   version. Don't re-enable `isAnimationActive` on that `<Pie>` without
   testing that shapes still actually render.
6. **A `next/script` `strategy="beforeInteractive"` script can
   mysteriously fail to apply on one specific route while working
   everywhere else** — confirmed on `/scheduled`: `data-theme` never got
   set despite the bootstrap script being present, byte-identical to
   working pages, localStorage correct, no console errors, across
   repeated hard reloads. Switching to a plain synchronous `<script>` tag
   in `<head>` (bypassing `next/script`'s queueing runtime entirely)
   *didn't* fix it either — the real fix ended up being a defensive
   `ThemeSync` client component (`components/ThemeSync.tsx`) that
   re-asserts the saved theme after React mounts, on every page. The exact
   root cause of the original failure was never identified.
7. **Vercel's "Sensitive" env var type is write-only** — once saved, it
   cannot be viewed again via the dashboard or `vercel env pull`, by
   design. `TILLER_SYNC_SECRET` was created this way by the other AI
   session; when it needed to be put into Apps Script's Script
   Properties, it had to be rotated (new value generated, set in both
   Vercel and Apps Script) rather than recovered.
8. **Deploys are manual** (§2b) — `git push` alone does not deploy
   `gm-money-web`. Always follow a code change with `vercel --prod` from
   `gm-money-web/`.
9. **`.next` can corrupt on this Windows/OneDrive setup** if a dev server
   is running while a build also touches it — delete `.next` and rebuild
   fresh if `next build`/`next dev` throws `EINVAL: invalid argument,
   readlink`. Prefer `npx tsc --noEmit` for quick type-checks over a full
   build when just verifying a small change.

---

## 6. Why HydraCloud's Supabase project specifically

Unchanged from the previous version: the owner had already used both free
Supabase project slots (Skrybix, HydraCloud) and didn't want a third, so
GM Money's tables live in a dedicated `gm_money` schema inside
HydraCloud's existing project (ref `qptipjjribhwjjakmwjx`).

---

## 7. Known bugs, blockers, and what actually happened this session

**RESOLVED this session** (all confirmed live, not just code-reviewed):
- The other AI's entire session of work existed only on disk / deployed
  to Vercel, never committed to git — brought fully into version control.
- Register duplicate-transaction risk from an un-idempotent
  `/api/tiller-sync` route (would have inserted the same transaction
  again every 15-minute sync) — fixed with upserts on a deterministic key.
- The receiving endpoint swallowing real Postgres/PostgREST error
  messages behind a generic "Sync failed" (PostgrestError objects aren't
  `instanceof Error`) — fixed, which is what let the next two bugs
  actually get diagnosed instead of staying mysterious.
- Balance snapshot upserts colliding across accounts (§5.2).
- A 60-day Tiller-sync lookback window silently repopulating 166 rows of
  the transaction history that had just been deliberately purged — twice
  (found, purged, recurred via the still-running trigger, found again,
  fixed at the root by enforcing `CUTOFF_DATE` server-side in the route
  itself rather than trusting the sender's window).
- `transaction_matches.match_method` check constraint rejecting the
  guessed value (§5.1).
- The concurrent-Supabase-query silent-empty-result bug (§5.4).
- The Recharts Pie animation bug (§5.5).
- The Scheduled page theme bug (§5.6).
- A hardcoded "Showing 2026-07-01 onward" string on the Dashboard that
  never got updated when the cutoff moved to 07-19 — now reads from the
  same exported constant everywhere.
- The Expense Constellation pie chart's center label overlapping the
  donut ring (the label was wider than the hole).

**No open hard blocker.** The main things worth knowing before touching
related code are listed in §5's numbered gotchas above.

---

## 8. Next concrete tasks (no fixed order — pick based on what the owner asks for)

1. Decide the notification-email provider and wire up actual sending (the
   compute/prefs side is done).
2. Scope and build the retail pricing guide, if the owner comes back to it.
3. Settle the open question in §9 (old system status) explicitly with the
   owner rather than continuing to leave it ambiguous.
4. Consider running `rebuildMerchantRules()` if merchant-memory
   suggestions start feeling stale post-purge.
5. Eventually: Next.js 16 bump (cross-sibling-app decision), a Reports
   screen (unscoped), the two legacy Sheets-native bugs (gated on §9).

---

## 9. Open question this session raised: has the old system actually been retired?

The original migration plan (`docs/migration-plan.md` — now largely
historical/superseded, see the note at its top) called for an explicit
parallel-run verification window and a deliberate owner go-ahead before
cutting over from `gm-money-frontend`/`app-script-backend` to
`gm-money-web`. **That formal step never happened** — but this entire
session was Crystal and Phil actively using `gm-money-web` for real
bookkeeping (entering transactions, hitting real bugs, confirming
reconciliation matches) with no indication they're also still using the
old Sheets UI in parallel. Functionally, the cutover appears to have
already happened in practice. Worth confirming explicitly with the owner:
is the old system still needed as a fallback, or is it safe to start
thinking about the cleanup phase (trimming `app-script-backend` to just
`TillerSync.gs`, eventually retiring `gm-money-frontend`)? Don't assume
either way — ask.

---

## 10. Files, APIs, and config — reference list

### Repo layout
```
CLAUDE.md                          -- project charter, read first for anything not covered here
AGENTS.md                          -- the other AI's (Codex) mirror of CLAUDE.md -- keep in sync if editing either
HANDOFF.md                         -- this file
docs/migration-plan.md             -- the ORIGINAL migration plan; schema/Tiller-sync sections superseded, auth/cron-mechanics sections still roughly apply. Treat HANDOFF.md as authoritative where they conflict.
gm-money-frontend/                 -- OLD frontend (Vite+React) -- status per §9, don't assume retired or live
app-script-backend/                -- OLD backend (Apps Script) -- same caveat; now also home to TillerSync.gs (still active, needed regardless of §9)
  TillerSync.gs                    -- pushes to gm-money-web's /api/tiller-sync every 15 min
gm-money-web/                      -- the live system, gm-money-web.vercel.app
  supabase/schema.sql              -- documents the adopted schema (not a script to re-run)
  supabase/migrations/             -- every additive SQL change made on top of the adopted schema, in order
  lib/supabase.ts                  -- Supabase client (schema-scoped, forces cache:"no-store" -- see §5.4) + getBusinessId()
  lib/register.ts                  -- running balance + dedup + effectiveStatus (§5.3)
  lib/scheduled.ts                 -- recurring-transaction generation
  lib/advisor.ts, lib/ai-advisor.ts -- Co-CFO Insights (free) / Ask GM Money (real OpenAI call)
  lib/lite.ts                      -- minimal balance query for /lite
  app/api/tiller-sync/route.ts     -- the sync receiving endpoint (§5.2, §7)
  app/api/cron/route.ts            -- daily Vercel Cron (scheduled autopost + review count)
  app/lite/page.tsx                -- PWA mobile view
  app/manifest.ts, app/icon.png, app/apple-icon.png -- PWA assets
  components/ThemeSync.tsx         -- defensive theme re-sync (§5.6)
  components/MatchToBankButton.tsx -- Register reconciliation UI
  components/DashboardCharts.tsx   -- cashflow + pie charts (§5.5)
  .env.local                       -- SECRETS, gitignored, not reproduced here
```

### Deploying (manual, every time)
```
git add -A && git commit -m "..." && git push origin main
cd gm-money-web && npx vercel --prod
```

### Required environment variables
Same list as before (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`AUTH_SECRET`, `CRON_SECRET`, `TILLER_SYNC_SECRET`), plus now
`OPENAI_API_KEY`/`OPENAI_MODEL` for the Ask GM Money feature. All are set
in both `.env.local` (local dev) and Vercel Production. `TILLER_SYNC_SECRET`
is also set in the Apps Script project's Script Properties (Project
Settings → Script Properties in the Apps Script editor) — it must match
the Vercel value exactly, and if it's ever rotated, both sides need
updating (§5.7).

### External accounts/access needed to continue
Same as before: Supabase dashboard (HydraCloud project), Vercel account
("Gathering Moss" team, project `gm-money-web`), the Apps Script project
(`clasp` already authenticated on this machine), the real Google
Sheet + Tiller.
