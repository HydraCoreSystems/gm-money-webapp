# GM Money — Independent Audit Findings (2026-08-08)

Scope: `gm-money-web/` per `docs/AUDIT_BRIEF.md`. Read-only investigation —
source review of every file listed in the brief's §4 leads, plus live
read-only queries against the production `gm_money` schema (Supabase
project `qptipjjribhwjjakmwjx`) to check whether each risk has actually
manifested in real data. **No fixes applied, nothing written to the
database.** Findings are ordered by severity within each section.

---

## Critical

### C1. The Register's manual↔bank match heuristic can hide a real, unrelated bank transaction and silently corrupt the account's running balance

**File:** `gm-money-web/lib/register.ts:66-131` (`normalizedWords`,
`looksLikeSameMerchant`, `dedupe`)

**What's wrong:** `normalizedWords()` keeps any token of 3+ letters,
which includes extremely common filler words ("the", "and", "for",
"you", "was", "has", "not", …) as well as short recurring merchant
fragments. `looksLikeSameMerchant()` only requires **one** shared word
between a manual entry's description and a candidate bank description.
Combined with same-amount + within-7-days, this is enough to falsely
pair two genuinely unrelated transactions — e.g. a manual entry "Paid
for the roof patch" (-$150, Aug 3) and an unrelated bank charge "THE
HOME DEPOT #4521" (-$150, Aug 5) share only the word "the" but pass the
heuristic.

**Why it matters — and this is the part that makes it worse than a
cosmetic mis-suggestion:** `dedupe()` doesn't wait for user confirmation
before hiding the bank row. The moment the heuristic fires, the real
bank transaction is added to `hiddenBankIds` and removed from `visible`
(`register.ts:121,128`) — it disappears from the Register entirely,
with only an unobtrusive "match candidate" hint surfaced on the manual
entry. If nobody happens to open that specific manual row and notice/
reject the suggestion, the real bank-cleared transaction stays invisible
indefinitely.

That silent hide has a second, compounding effect: `clearedSum`
(`register.ts:222-224`) is computed from the same deduped `visible` list,
so the falsely-hidden transaction is excluded from `clearedSum` too —
but `rawBankBalance` (the real bank snapshot) already includes it, since
the bank actually cleared it. The anchor `rawBankBalance - clearedSum`
(`register.ts:225`) is therefore overstated by exactly that transaction's
amount, and every running balance for every later row in that account is
off by the same amount from then on. This isn't a display glitch — it's
a wrong "Current Balance" and wrong per-row running balance, silently,
for a real financial account, with no error or warning anywhere.

**Verification against live data:** queried all manual/bank pairs
sharing the same account+amount within 7 days that aren't yet explicitly
matched (`transaction_matches`). Today's real data (11 pairs found) is
clean — every pair is a genuine same-merchant, same-amount match (e.g.
three distinct "Palmstreet" charges correctly paired 1:1 by their
distinct amounts). **No evidence this has misfired yet**, but the
underlying condition (same amount + a shared common word + close dates)
is a realistic, everyday occurrence for a resale business with recurring
small-dollar vendors, not a contrived edge case.

**Suggested fix (not applied):** (a) raise the minimum shared-word
length or exclude a stopword list ("the", "and", "for", "pay", "vis",
"pos", "debit", "card", "purchase" — several of these appear in *every*
Tiller description and are functionally meaningless as a match signal);
(b) don't hide a heuristic (non-explicit) candidate's bank row from
`visible`/`clearedSum` at all — only hide rows with an explicit
`transaction_matches` link, and show the *unconfirmed* bank row as its
own normal Register line alongside the manual entry with a "possible
duplicate" affordance, so a false match degrades to "two visible rows,
mild annoyance" instead of "one real transaction vanishes and the
balance goes wrong."

---

### C2. `/api/tiller-sync`'s new date-drift fix can merge two genuinely different transactions into one, permanently losing one of them

**File:** `gm-money-web/app/api/tiller-sync/route.ts:204-241`

**What's wrong:** The fix for the original duplicate-date bug looks for
an existing row within `DUPLICATE_MATCH_WINDOW_DAYS` (5 days) matching
`account_id + source + amount`, then narrows to an exact
case-insensitive description match. If found, it **updates** that row
in place (including overwriting its `transaction_date` and
`source_record_id`) instead of inserting a new one.

This is exactly what's needed to fix the original bug (one real
transaction whose reported date drifts between syncs), but the match
criteria can't actually distinguish "the same transaction reported
twice with a shifted date" from "two different real transactions that
happen to share amount, description, and account within 5 days." Small
businesses hit the second case constantly: two identical-amount coffee/
supply purchases at the same merchant in the same week, or (very
concretely, and already borderline visible in this account's own data —
see the three same-week "Palmstreet" charges above, which only avoided
collision because their amounts differed) a recurring subscription
double-billed after a failed payment retry.

**Why it matters:** when this fires, the second real transaction is
never inserted — it silently overwrites the first row's data. One of
the two real, distinct purchases simply disappears from the ledger with
no error, no log entry indicating a merge happened (only a normal
`update` no different from a legitimate date-drift correction), and no
way to tell after the fact that it happened (the migration in
`20260808024900_dedupe_shifted_date_tiller_transactions.sql` handles
this shape of problem for *pre-existing* duplicates, but nothing detects
it going forward for new syncs).

**Verification against live data:** checked for any current `tiller`-
sourced transactions sharing account+description+amount (i.e., rows
that would collide under this logic if resynced) — none exist today.
The risk is real but hasn't been triggered yet in this account's short
post-cutoff history.

**Suggested fix (not applied):** don't use the fallback `update` path
without also comparing something that couldn't be forged by
coincidence — e.g. only treat it as a date-drift correction if
exactly one nearby row of that description+amount exists on the
*bank's own pending→posted* transition (Tiller side has no other way to
signal that, so a reasonable proxy is to require the *previous* sync's
copy of this same window to also have contained exactly one candidate);
or narrow the window further and accept that a small number of true
duplicate-date-shift cases might need the one-time cleanup migration
pattern again rather than trying to auto-resolve every case inline.

---

## High

### H1. `entry/actions.ts` and `register/actions.ts`'s strict sign check blocks a category/amount combination `CLAUDE.md` explicitly says is valid — refunds on expense categories

**Files:** `gm-money-web/app/entry/actions.ts:158-168`,
`gm-money-web/app/register/actions.ts:110-120`

**What's wrong:** Both manual-entry paths reject any transaction where
`Math.sign(amount) !== expectedSign` for the chosen category's type
(income ⇒ must be positive, expense ⇒ must be negative). But
`CLAUDE.md`'s own data-model section is explicit: *"a refund on an
expense category is still an expense-category transaction … not
income, even though its amount is positive."* That's a real, named,
expected case in this business's data model — and there is currently no
way to manually enter it. A refund of a business expense (returned
inventory, a vendor credit, a reversed charge) that Crystal or Phil
wants to record by hand through `/entry` or correct through
`/register`'s edit form gets hard-rejected with *"That category is
expense, so the amount should be negative."*

**Why it matters:** this is the same class of bug the sign check was
added to prevent, just inverted. A user blocked by this validation has
exactly two options, both wrong: (1) pick "Income" for a category that
isn't actually income, corrupting that category's totals and every
income/expense chart on the Dashboard, or (2) enter the refund as a
negative amount (i.e. record money coming in as if it were going out),
which corrupts the running balance by double-counting the outflow it's
supposed to reverse. Either way, the validation meant to protect data
integrity forces the user into a choice that damages it. (Note:
bank-fed refunds handled through `/review`'s `approveReviewTransaction`
— `app/review/actions.ts` — correctly have no sign check at all, which
*is* consistent with the refund rule; this finding is specifically that
the two manual-entry paths are stricter than the documented business
rule allows.)

**Suggested fix (not applied):** relax the manual-entry check to match
what `CLAUDE.md` actually specifies: category type should determine
*classification* (which totals a transaction nets against), not force a
sign. A safer validation would flag amount/category-type sign
mismatches as a confirmation prompt ("this expense category usually has
negative amounts — is this a refund?") rather than a hard block, or add
a lightweight "this is a refund/reversal" checkbox that explicitly
allows the sign exception the same way bank-fed data already implicitly
allows it.

---

### H2. `app/settings/actions.ts` has a second, currently-dead `createSubcategory` that hardcodes `category_type: "expense"` regardless of the parent category

**File:** `gm-money-web/app/settings/actions.ts:29-52`

**What's wrong:** This is a duplicate implementation of subcategory
creation, separate from the one actually wired up
(`app/entry/actions.ts:63-114`, which correctly inherits `category_type`
from the parent). This one ignores the parent entirely and always
inserts `category_type: "expense"`. Creating a subcategory under an
Income category through this code path would create a subcategory whose
type disagrees with its own parent category — the exact
Category≠Type corruption `CLAUDE.md` calls out as having caused real
data corruption once already.

**Why it matters:** verified this function is not imported or referenced
anywhere in the app today (`components/SettingsPanel.tsx` only imports
`setBudget`/`deleteBudget` from that file) — it is currently dead code
and not reachable through the live UI. Flagging as High rather than
Critical for that reason, but it's a real landmine: it looks like a
legitimate, complete implementation sitting in the exact file a future
"add subcategory management to the Settings page" feature would
naturally extend, and nothing about it looks wrong at a glance. The
sibling `createCategory` in the same file also skips the
income/expense string validation that `app/entry/actions.ts`'s version
has (`type !== "income" && type !== "expense"` check), so any
non-`"income"`/`"expense"` string submitted would be written directly
into `category_type` unvalidated.

**Suggested fix (not applied):** delete these two dead functions from
`app/settings/actions.ts`, or if Settings is meant to eventually own
category management independently, point them at the same
`app/entry/actions.ts` implementations instead of maintaining a second,
divergent copy.

---

## Medium

### M1. `CUTOFF_DATE` is a hand-copied literal in four places with no shared import

**Files:** `lib/dashboard.ts:13` (canonical, exported),
`lib/register.ts:13`, `lib/review.ts:4`,
`app/api/tiller-sync/route.ts:14`

**What's wrong:** all four currently agree (`"2026-08-01"`), but only
`lib/dashboard.ts`'s copy is actually exported and imported anywhere
(`app/page.tsx`). The other three are independent string literals with
a comment promising they're "kept in sync," which is exactly the
pattern `docs/AUDIT_BRIEF.md` flags as having already bitten this
project once (the Tiller duplicate-key bug was a different instance of
"documented as synced, nothing enforces it"). The cutoff was already
moved once this session (07-19 → 08-01) and required editing all four
by hand — nothing would catch a future edit that updates three of the
four and misses one.

**Why it matters:** a drifted cutoff wouldn't error — it would silently
change what "current" means differently across screens. E.g. if
`tiller-sync/route.ts`'s copy were changed to an earlier date without
updating `dashboard.ts`, historic bank transactions synced back into the
range `[old_cutoff, new_cutoff)` would be accepted into `transactions`
but never appear on the Dashboard or Register (their own cutoffs still
exclude them) — money silently present in the running-balance walk
(since `register.ts`'s balance math uses full history, only the
*display* list is cutoff-filtered) but invisible in every list, which
is a confusing, hard-to-diagnose state.

**Suggested fix (not applied):** export `CUTOFF_DATE` from one module
(e.g. `lib/dashboard.ts`, as already done) and import it in the other
three instead of redeclaring the literal. `app/api/tiller-sync/route.ts`
is a Route Handler, not a Server Component, but can still import from
`@/lib/dashboard` the same way Server Actions do.

### M2. A residual `Promise.all` on concurrent Supabase queries remains in `lib/dashboard.ts`, in the exact pattern already proven to silently return wrong data elsewhere

**File:** `gm-money-web/lib/dashboard.ts:168-182`

**What's wrong:** `HANDOFF.md` §5.4 documents a confirmed-live bug where
two Supabase queries fired concurrently via `Promise.all` on the same
client instance could have one silently come back empty — no error. The
documented fix was two-layered: force `cache: "no-store"` at the client
factory (`lib/supabase.ts`), plus de-parallelize the specific queries in
`lib/register.ts` "as defense in depth" because the root cause was
never fully proven. `lib/dashboard.ts:168` still fires
`pendingReviewCount` and `unclearedCount` through `Promise.all` on the
same client — the exact shape of the original bug, just not the
specific call site that got the defense-in-depth treatment.

**Why it matters:** if the client-factory fix doesn't fully cover every
condition that triggered the original bug (which HANDOFF.md itself
says is unproven, only "suspected"), this is the next place it would
resurface — and it would manifest as the Dashboard's "pending review"
or "uncleared" tile silently showing 0 or a wrong count, which is
exactly the kind of "looks fine, quietly wrong" failure this audit is
looking for.

**Suggested fix (not applied):** sequential-await these two the same way
`lib/register.ts` and the account-balance loop in `lib/dashboard.ts`
itself already do, for consistency and to close out the residual risk
rather than leaving one call site relying solely on the unproven
client-factory fix.

### M3. Shared-secret comparisons on both machine-to-machine endpoints are not constant-time

**Files:** `app/api/tiller-sync/route.ts:103`
(`provided !== SHARED_SECRET`), `app/api/cron/route.ts:15` (same
pattern)

**What's wrong:** both `TILLER_SYNC_SECRET` and `CRON_SECRET` are
checked with plain `!==` string comparison, which short-circuits on the
first differing byte and is therefore vulnerable in principle to a
timing side-channel that could help an attacker guess the secret
character-by-character.

**Why it matters:** real-world exploitability is low — these are
network calls over HTTPS to a Vercel-fronted endpoint, where network
jitter typically swamps the sub-microsecond signal a timing attack needs,
and there's no rate-limit-free local attacker model here. Flagging per
the brief's explicit ask (§4.12) rather than as a practical near-term
risk.

**Suggested fix (not applied):** use a constant-time comparison (e.g.
Web Crypto: hash both sides and compare digests, or a manual
fixed-length XOR-accumulate compare) for both secrets.

### M4. No login rate-limiting or lockout; no password-reset flow

**Files:** `gm-money-web/app/login/actions.ts`,
`gm-money-web/lib/app-users.ts`

**What's wrong:** `login()` has no attempt counting, backoff, or
lockout — an attacker with network access to `/login` (or the login
Server Action endpoint directly) can attempt unlimited password guesses
against any known email. bcrypt's inherent cost (`bcrypt.hash(..., 10)`)
provides some throttling per-attempt, but nothing caps *attempts*.
Separately, there is no self-service password-reset flow anywhere in
the app — a user locked out of their account has no recovery path
short of an owner/admin creating a new account for them via
`/settings/users` (itself gated to `owner`/`admin` roles) or someone
with direct database access resetting `password_hash`.

**Why it matters:** for a two-person household app this is a low
real-world risk today, but it's a real, concrete gap that would matter
more the moment more users are added (per `HANDOFF.md`'s "eventual
target" framing of real accounts) or if the app is ever exposed more
broadly. Named explicitly since the brief asked for it (§4.7).

**Suggested fix (not applied):** add a simple attempt counter (e.g. a
column or a short-TTL Supabase table keyed by email/IP) with exponential
backoff or a temporary lockout; scope a password-reset flow (likely
email-based, which also depends on the still-unbuilt notification-email
provider decision noted in `HANDOFF.md` §4).

### M5. `matchToBank` doesn't verify the manual and bank rows belong to the same account, and doesn't check amounts agree

**File:** `gm-money-web/app/register/actions.ts:154-215`

**What's wrong:** `matchToBank(formData)` looks up both `manualId` and
`bankId` by `business_id` only, confirms one is `sheet_manual` and the
other is `tiller`, and links them — with no check that they share
`account_id`, and no check that their `amount`s agree. `accountId` is
present in the form data but only used for `revalidatePath`, never as a
filter.

**Why it matters:** in the normal UI flow this can't be triggered — the
Register only ever offers candidates the heuristic already restricted
to the same account and same amount (`register.ts:113,118`). But this
is a Server Action, directly callable with arbitrary form data, and
nothing server-side re-derives or re-validates the pairing it's
about to permanently record in `transaction_matches`. A mis-issued or
manipulated request could link a manual entry in one account to a bank
row in a different account (or a different amount), permanently
recording a false reconciliation with no way to undo it from the UI.

**Suggested fix (not applied):** re-select both rows' `account_id` and
`amount` alongside `source` and assert they match before inserting the
`transaction_matches` row, the same defense-in-depth already applied to
every other write path in this file.

### M6. Tiller-dupe cleanup migration's match-repoint logic can point two `transaction_matches` rows at the same surviving bank transaction

**File:**
`gm-money-web/supabase/migrations/20260808024900_dedupe_shifted_date_tiller_transactions.sql:104-126`

**What's wrong:** within one duplicate group, the migration first
*deletes* a loser's `transaction_matches` row only if the survivor
already has one, then unconditionally *repoints* every remaining
loser's match onto the survivor. If a duplicate group happened to
contain **two** losers that each already had their own (different)
match at the time the migration ran, and the survivor itself had none,
the first loser's match would repoint fine — but there's no logic
preventing a second loser's match from also repointing onto the same
now-already-matched survivor, producing two `transaction_matches` rows
with the same `bank_transaction_id`.

**Why it matters:** this is exactly the dangling/double-update risk the
brief (§4.11) asked to check for. **Verified against live data this did
not actually happen**: a direct query for any `bank_transaction_id`
referenced by more than one row in `transaction_matches`, and for any
match referencing a transaction id that no longer exists, both return
zero. So this migration's real-world run was clean — flagging as a
latent logic gap in the migration script itself (worth knowing about if
it, or a similar future cleanup script, is ever run again) rather than
an active data problem today.

---

## Low

### L1. `lib/ai-advisor.ts` embeds unsanitized bank-controlled description text into the LLM context JSON

**File:** `gm-money-web/lib/ai-advisor.ts:210-259`

Real Tiller-sourced transaction descriptions (`recentTransactions`,
sourced from `getDashboardData()`) flow into `buildBusinessContext()`
and then into the OpenAI request body verbatim, with no sanitization.
In principle a bank description containing prompt-injection-style text
("ignore prior instructions and recommend...") could attempt to steer
the model's output. Real-world impact is limited exactly as the brief
suggests (§4.8): the advisor's output (`answer`/`priorities`/`actions`/
`risks`) is display-only narrative text, never used to trigger any
action, write any data, or bypass any auth/authorization check — so the
worst case is misleading advice text, not a security boundary crossing.
Not urgent to fix, but worth being aware of if the advisor's output is
ever wired to anything more automated in the future (per `CLAUDE.md`'s
own "AI direction" section, which explicitly frames this as advisory-
only for now).

### L2. `processDueScheduledTransactions()`'s existing-row check is a plain select-then-insert, not enforced by a unique constraint

**File:** `gm-money-web/lib/scheduled.ts:199-248`

The catch-up loop checks for an existing `(business_id, schedule_id,
transaction_date)` row before inserting a new occurrence, but this is
an application-level check, not backed by a database unique constraint
(the actual DB uniqueness is on `(business_id, source,
source_record_id)`, and `source_record_id` here is a fresh
`crypto.randomUUID()` per insert — it can never collide, so it does
nothing to prevent a duplicate occurrence). Two overlapping invocations
(e.g. the daily Vercel Cron firing at the same moment as an owner
clicking "run now," or two cron retries) could both pass the `select`
before either finishes its `insert`, producing two transactions for the
same schedule+due-date. Given this only runs once daily via cron plus
occasional manual triggers, the collision window is narrow and this
hasn't been observed, but it's the same shape of "assumed-safe
check-then-act" the brief's framing (§3) specifically asks to look for.

**Suggested fix (not applied):** add a real unique constraint on
`(business_id, schedule_id, transaction_date)` in `transactions` (where
`schedule_id` is not null) and let the insert itself fail/upsert-ignore
on conflict, rather than relying on the preceding `select` to be race-free.

### L3. `/setup`'s first-owner gate has a narrow TOCTOU window

**File:** `gm-money-web/app/setup/actions.ts:27-37`

`completeFirstTimeSetup` checks `getAppUserCount() === 0` and then, in a
separate later step, inserts the new owner row — two concurrent
requests to `/setup` before any user exists could both pass the count
check and both succeed, creating two "first" owner accounts. Only
exploitable during the brief initial-provisioning window before any
account exists, and requires an attacker to already have unauthenticated
access to hit `/setup` (which middleware intentionally allows,
by design, until setup is complete). Low real-world risk given the
narrow window and single-tenant deployment, but worth a note since it's
the same check-then-act shape as L2.

---

## Confirmed correct / re-verified (not new findings, per brief §5 — listed because the brief asked these be specifically re-checked)

- **RLS posture (§4.9):** confirmed both `getSupabaseServerClient()` and
  `getSupabaseServerClientPublic()` in `lib/supabase.ts` always
  construct their client with `SUPABASE_SERVICE_ROLE_KEY`; grepped the
  entire `gm-money-web/` tree for `NEXT_PUBLIC_SUPABASE` — no matches
  anywhere. `HANDOFF.md` §5.10's reasoning still holds.
- **Category/Type invariant, other write paths (§4.5):**
  `app/entry/actions.ts`, `app/register/actions.ts` (create/update), and
  `lib/scheduled.ts`'s `validateScheduledAmountForCategory` (used by
  both `createScheduled`/`updateScheduled` and the autopost loop itself)
  all validate server-side, not just client-side. (See H1 above for the
  one place this validation is arguably *too* strict relative to
  `CLAUDE.md`'s own refund exception, and see H2 for a dead code path
  that doesn't validate at all.)
- **Secrets logging (§4.12):** grepped for `console.log`/`console.error`
  /`Logger.log` calls near secret-related identifiers across
  `gm-money-web/` and `app-script-backend/` — no matches.
- **Migration dangling-row risk (§4.11):** see M6 — logic gap exists in
  the script, but live-queried production data shows it did not
  actually produce dangling or double-matched rows in this run.
- **Balance-snapshot-missing edge case (§4.2, part of the running-balance
  stress test asked for):** both currently-active accounts (`Spend`,
  `Business Checking`) have real snapshot history today, so
  `register.ts:190`'s `Number(snapshot?.balance ?? 0)` silent-zero
  fallback hasn't been triggered in production. Still a real latent gap
  worth knowing about: a newly-added account with no Tiller sync yet, or
  any account whose snapshot insert silently fails, would have its
  entire register anchored to $0 with no error — every balance for that
  account would be wrong by the true opening balance, silently. Not
  listed as its own numbered finding above since it's really the same
  root cause as C1 (an unvalidated anchor assumption in the same
  function) — surfacing it here so it isn't lost.

---

## Summary table

| # | Severity | Area | One-line |
|---|----------|------|----------|
| C1 | Critical | Register dedupe | Common-word heuristic can hide a real bank transaction and skew the running balance for every later entry |
| C2 | Critical | Tiller sync | 5-day window+description+amount match can merge two real transactions into one, losing one silently |
| H1 | High | Manual entry validation | Sign check blocks the documented refund-on-expense-category case |
| H2 | High | Settings (dead code) | Unused `createSubcategory` hardcodes wrong category type |
| M1 | Medium | CUTOFF_DATE | Four unlinked literals, one already drifted-and-fixed once |
| M2 | Medium | Dashboard queries | Residual `Promise.all` in the exact shape of a proven-live bug |
| M3 | Medium | Secrets | Non-constant-time secret comparison (both machine endpoints) |
| M4 | Medium | Auth | No login rate-limiting; no password-reset flow |
| M5 | Medium | Reconciliation | `matchToBank` doesn't re-validate account/amount agreement |
| M6 | Medium | Migration | Match-repoint logic could double-link (didn't, in practice) |
| L1 | Low | AI advisor | Unsanitized bank text in LLM context (advisory-only, low impact) |
| L2 | Low | Scheduled autopost | Check-then-insert race, no DB-level uniqueness backstop |
| L3 | Low | /setup | TOCTOU on first-owner creation |
