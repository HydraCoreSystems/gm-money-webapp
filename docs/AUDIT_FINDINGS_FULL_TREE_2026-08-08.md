# GM Money — Full-Tree Independent Audit (2026-08-08, whole-repo second pass)

Scope: the **entire repository** `HydraCoreSystems/gm-money-webapp`, not just the
live app. This extends `docs/AUDIT_FINDINGS_2026-08-08.md` (which covered
`gm-money-web/` only). All fixes from that first pass were re-checked and are
confirmed **present and correct** (see §4); they are not re-reported here as
open findings.

New surface reviewed this pass:

- `gm-money-web/` — full re-pass over actions / routes / components / lib
  (several NEW issues found, below)
- `app-script-backend/` — ~11,000 lines of Google Apps Script, **never
  independently reviewed** (includes `TillerSync.gs`, still live in production)
- `gm-money-frontend/` — 3.4k lines of Vite+React SPA, never reviewed
- `gm-money-web/supabase/` migrations + `schema.sql`, configs, docs

Method: read-only. No files or DB mutated. Each finding is labeled with how it
was established: **[verified]** = I read the exact lines and traced the
behavior; **[agent]** = reported by a deep-read reviewer agent and spot-checked
but not independently exercised. Live read-only DB checks were run against the
production `gm_money` schema to test whether each risk has actually manifested.

**Caveat about the old system:** per `HANDOFF.md` §9, whether Crystal/Phil
still use the Sheets UI + old API in parallel is an unresolved question.
Several of the worst findings below only bite if **that** system is still being
written to; they are grouped in §2 and each notes its dependency.

---

## Severity summary

| #  | Sev | System              | One-line |
|----|-----|---------------------|----------|
| A1 | High | app-script-backend   | Sheet-UI entry writes Subcategory into a legacy "Business Area" column — subcategory silently lost (needs old system in use) |
| A2 | High | app-script-backend   | Deterministic bank-key collisions hide/never-categorize a second identical transaction (needs old system in use) |
| A3 | High | gm-money-frontend    | Settings edits never refresh the frozen FormOptions used by every other screen — stale/wrong category lists |
| A4 | Med  | gm-money-frontend    | Shared password in sessionStorage, sent in cleartext per call |
| A5 | Med  | gm-money-web         | Most mutating Server Actions have no in-function auth check (middleware only) |
| A6 | Med  | gm-money-web         | Client-supplied accountId/categoryId written without business-scope revalidation |
| A7 | Med  | gm-money-web         | matchToBank can link the same bank row to two manual entries (no server guard) |
| A8 | Med  | gm-money-web         | lib/settings.ts still uses Promise.all on the shared supabase client |
| A9 | Med  | gm-money-web         | /api/ai/advice has no usage/cost rate limit and no timeout on the OpenAI call |
| A10 | Med | app-script-backend   | GMDash sign-vs-category income/expense (known bug, still present) |
| A11 | Med | app-script-backend   | Sheets-UI saves take no script lock → double-append/lost-update on concurrent saves |
| A12 | Med | app-script-backend   | Old API dashboard cache not invalidated by sheet-side writes (5-min stale) |
| A13 | Med | app-script-backend   | 15-second full-field duplicate gate silently discards a legitimate identical repeat |
| A14 | Med | app-script-backend   | "Needs Review" status counted as Cleared in Register running-balance walk |
| A15 | Med | app-script-backend   | Scheduled catch-up capped at 24 backfill iterations per run (docs claim 180 — stale) |
| A16 | Low | gm-money-web         | Login lockout counter never decays — account can be re-locked indefinitely |
| A17 | Low | gm-money-web         | Scheduled/autopost errors collected but never surfaced to the user |
| A18 | Low | gm-money-web         | Recurring schedules still reject refund-on-expense (recurring-only H1 case) |
| A19 | Low | gm-money-web         | Tiller date-drift update can rewrite a pre-CUTOFF row into the current window |
| A20 | Low | gm-money-web         | Advisor Panel fetch endpoints lack error handling → permanently stuck loading |

---

## 1. High findings

### A1. Sheet-UI manual entry writes Subcategory into a legacy "Business Area" column; the data is silently lost
**file:** `app-script-backend/Entry.gs:855,860,915` — **[verified]**
`output[6] = values.subcategory` (index 6) on both the edit and new-entry paths.
**Why it's wrong:** `Api.gs:379-395` documents that the live
`GM_ManualTransactions` sheet's real "Subcategory" column is found by header
lookup at physical column ~17; index 6 is a legacy "Business Area" field.
Every other subsystem reads Subcategory via header map position (index ~17);
the Entry form **never writes that column at all**.
Consequence: every manual transaction entered through the Sheets Entry tab (if
still in use) stores its subcategory under a dead column → never shows on
charts/spending, and reloads as blank on edit. Silent structural data loss of
the second classification level. Amount/category unaffected.
Dependency: only if the raw-Sheets UI is in (concurrent) use. `gm-money-web`
does not have this bug.

### A2. Deterministic bank keys collide when the bank reports two identical rows, hiding/never-categorizing one
**file:** `app-script-backend/Transactions.gs` `buildTransactionKey_`
(~1295-1333); consumers `Register.gs:494-517`, Review dedup
(`Transactions.gs:305-317`). **[agent]** — the key
`date | lower(trim(desc)) | amount.toFixed(2) | account` is the unique
identity used everywhere; Tiller supplies no unique id. Two sibling rows with
the same (date, description, amount, account) collapse to the same key. In the
Register the second row is removed as a duplicate; in Review, once one of the
two keys is approved, **both** raw rows are skipped forever → one real
transaction never gets a category and never appears in any spending figure.
Dependency: only if the old Review/approve path and/or old register is still
used against live data. **No current production duplicate was found** in the
new system's tables, and the new system uses a different (source) key design —
this is an old-system risk.

### A3. Old frontend's Settings edits never propagate to the FormOptions used by every other screen
**file:** `gm-money-frontend/src/App.tsx:69`, `src/hooks/useFormOptions.ts:12-43`,
`src/features/settings/SettingsView.tsx:106-122` — **[verified]** the options
are fetched once at mount; Settings keeps a private re-fetch but nothing else
reads it. Create a category in Settings → invisible on Entry/Review/Scheduled/
Merchant screens until a full page reload; a deleted one stays in every other
screen's picker and then fails server-side.

---

## 2. Old-system (app-script-backend) medium findings

- **A10 (GMDash sign-vs-category income/expense).** `Dashboard.gs:~385-389`: a
  refund (positive amount) on an Expense category counts as **Income**; the old
  Home/RefreshHome dashboards show different "expenses" than the web API.
  Documented known bug (HANDOFF §4) — **[verified]** still present.
- **A11 (no script lock on Sheets saves).** Only the API path takes a
  `LockService`; Sheet-side saves do not. Two concurrent saves (e.g. Crystal +
  Phil within ms) can double-pass the read-own-write blank check → a
  double-append or a lost row-update.
- **A12 (stale 5-min cache).** `apiGetDashboard` caches 5 minutes; sheet-side
  writes don't invalidate it → up to 5 minutes of divergence between the old
  Sheet UI and old API dashboard.
- **A13 (15-second duplicate gate swallows a legitimate repeat).**
  `Entry.gs:1187-1238`: two purchases identical in every field (payee, amount,
  category, subcategory, notes, method, date) within 15 s → the second is
  dropped as a typo-double-tap and never written. Legit twin-buys at the same
  vendor are a real case.
- **A14 ("Needs Review" counts as Cleared).** `Register.gs:~581`: the
  running-balance walk treats every non-"uncleared" status as cleared → wrong
  per-row intermediate balances when any row is "Needs Review".
- **A15 (catch-up cap is 24, docs say 180).** While a schedule lapses long,
  one run backfills up to 24 previous occurrences as new Uncleared manual rows.
  The header comment claims 180; the actual loop is `safety < 24` — **code vs.
  documentation mismatch**.
- **A16 (old frontend).** The Register "link" dialog builds its *manual*
  dropdown from the last 150 rows only — an older Uncleared entry can never be
  matched → permanent duplicate.
- **A17 (old frontend).** A category literally named "Other" collides with the
  synthesized catch-all slice → React key collision in pie/legend; Dashboard
  does not refresh while open.
- **A18 (low, informational).** `createManualTransactionId_` /
  `createAutomationTransactionId_`: second-timestamp + 4-digit random ⇒
  ~1:65,536 collision per same second; on collision a lookup finds only the
  first row. `merchantMemorySimilarityBoost_` can return 1.0 similarity when
  two merchants share one memory.

---

## 3. New-system (gm-money-web) medium/low findings

- **A5 (auth is middleware-only on mutations).** `entry/actions.ts`,
  `review/actions.ts`, `settings/actions.ts`, `merchants/actions.ts`,
  `scheduled/actions.ts`, and the notifications actions don't call
  `requireAuthenticatedUser()`/`requireRole()` in-function — only
  `middleware.ts` is between a caller and these POSTs. **Today** the matcher
  (`middleware.ts:29-31`) closes the frontal hole (all paths except `/login`,
  `/setup`, `/api/health`, `/api/tiller-sync`, `/api/cron/**`, PWA assets),
  but the matcher is exactly where a future "make this route public" edit would
  silently open **every** write. Fix: call `requireAuthenticatedUser()` at the
  top of each mutation action (as `register/actions.ts`, `users/actions.ts`,
  `password/actions.ts` already do). **[verified]**
- **A6 (client-supplied ids aren't business-scoped).** `entry/actions.ts:151-158`
  and `register/actions.ts:102-106` look up category with `.eq("id", ...)`
  **only** (no business_id); `scheduled.ts:99-107` same. A crafted POST can
  write a `category_id`/`account_id` from another business or an inactive row
  (service_role bypasses RLS). Not reachable via today's UI, but it is the
  "server re-validates what the client sent" discipline M5 from the prior pass
  re-established. Fix: add `.eq("business_id", ...)` and verify the account is
  active before insert. **[verified]**
- **A7 (matchToBank has no same-bank guard).** `register/actions.ts:~190`
  inserts a `transaction_matches` row without checking for an existing row with
  the same `bank_transaction_id`. A double-fire could pair one bank row to two
  manual ids (hides the bank row, marks two manual rows Cleared). Not reachable
  via the Register UI (it excludes rows already hidden) but the Server Action
  endpoint itself accepts it. Fix: pre-check exists on
  `transaction_matches(business_id, bank_transaction_id)` or add a partial
  unique index. **[verified]**
- **A8 (Promise.all in settings).** `lib/settings.ts:19` still runs
  `Promise.all` of two supabase queries on the shared client — the precise
  shape HANDOFF §5.4 documented as once silently returning empty results, and
  which `lib/register.ts` / `lib/dashboard.ts` were deliberately
  de-parallelized over. Categorize/budgets can silently render empty on
  Settings. **[verified]**
- **A9 (advice endpoint: no throttle, no timeout).** `app/api/ai/advice` POST
  has no rate limit and the OpenAI call has no timeout; each call bills
  `OPENAI_API_KEY` (successful or not) and a hung upstream holds the function
  until the platform timeout. It is behind middleware auth, so only reachable
  with a valid session. Fix: per-user/minute throttle + `AbortSignal.timeout()`.
- **A16 (lockout never decays).** `lib/app-users.ts:301-315`: `failed_attempts`
  only clears on successful login; a failed attempt after the lock window
  re-arms the ≥5 counter and opens a new 15-minute lock. An attacker with a
  known email can hold that account effectively locked at low frequency. Low
  real-world impact (2 users), but the decay semantics are wrong. **[verified]**
- **A17 (autopost errors invisible).** `lib/scheduled.ts:~222` collects
  `errors[]`; nothing consumes it — `cron/route.ts` and `scheduled/actions.ts`
  return counts only. A schedule failing forever (sign-gate, empty category)
  is invisible; the chain silently stops filling the register.
- **A18 (recurring still sign-gates refunds).** `lib/scheduled.ts:~111,~182-189`
  still hard-reject `Math.sign(amount) !== expectedSign` for recurring
  transactions, while manual entry accepts refund-on-expense since the H1 fix.
  A recurring vendor credit / refund cannot be persisted.
- **A19 (tiller date-drift can rewrite a pre-CUTOFF row).**
  `app/api/tiller-sync/route.ts:228-241`: the window matcher has no lower bound
  at CUTOFF_DATE (only ±5 days). If a real pre-cutoff purchase and a new
  post-cutoff one share account+desc+amount within day 5, a single match
  triggers an **update** of the old row (new date + new source_record_id)
  instead of inserting. Latent only (all data today is post-CUTOFF). Fix: add
  `.gte(transaction_date, CUTOFF_DATE)` to the window query. **[verified]**
- **A20 (Advisor Panel hangs on error).** `AskAdvisorPanel.tsx` ask /
  loadHistory / saveOutcome have no try/catch — a failed fetch leaves the panel
  in "Analyzing…" forever.

---

## 4. Re-verified as correct (prior-pass fixes confirmed present)

- **C1 (register dedupe hidden-candidate):** unconfirmed heuristic candidates do
  **not** hide the bank row (only explicit `transaction_matches` rows do);
  stopwords list added. Live check today: **0** duplicate pairs.
- **C2 (Tiller 5-day merge):** fixed — requires exactly one matching candidate.
- **H1/H2 (sign-validation / dead code) on `gm-money-web`:** fixed; refund-on-
  expense works on both manual paths.
- **M1 (shared CUTOFF):** all 4 places import from `lib/constants.ts`.
- **M2 (`dashboard.ts` de-parallelized):** verified (A8's residual remains in
  `settings`).
- **M3/M4a/M5/L2/L3:** present + correct (constant-time secret compare, etc.).
- **Schedule duplicate index** `transactions_schedule_date_uidx` + tolerant
  insert present, DB applied. Live check: **0** duplicate groups.
- **`create_owner_user` RPC:** live-deployed; both branches verified by real
  probe (insert → row returned; owner-guard → abort `GM_OWNER_EXISTS`).

---

## 5. Live DB checks (read-only, run this session)

- `transaction_matches`: 20 rows. Duplicate `bank_transaction_id`: **0**;
  one bank → two manuals: **0**.
- `transactions` (tiller): 86 rows. Groups of identical desc+amount+acct:
  **0** (no A2-collision candidates).
- Two active owner accounts (`clachleman@gmail.com`, `gatheringmossphil@gmail.com`)
  + two inactive owner rows — confirms the original L3 "at-most-one-owner"
  index would have been **wrong** for this deployment; the advisory-lock
  first-owner guard matches the real data.

**Net: no production DB issue reproduced today — checks came back clean. The
findings above are latent code/defense gaps plus deferred old-system bugs.**

---

## 6. Recommended priorities

1. A5 — in-function auth on every transaction action (cheap, closes the
   middleware-only gap)
2. A6 + A7 — business-scoped category/account lookups; matchToBank duplicate
   guard
3. A8 — sequential settings queries
4. A9 — throttle + `AbortSignal.timeout()` on `/api/ai/advice`
5. A19 — floor the tiller-sync window at CUTOFF_DATE
6. If the old system is still in use: A1 (Subcategory column), A2 (key
   collision), A10 (dashboard sign), A11 (script lock), A15 (24 vs 180)

*End of audit.*
