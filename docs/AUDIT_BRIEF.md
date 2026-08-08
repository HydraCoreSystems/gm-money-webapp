# GM Money — Independent Audit Brief

**Purpose of this document:** hand this to a *fresh* AI session (or human
reviewer) with no prior context on this project. It should be enough on
its own to start a thorough correctness/security/architecture review of
the live system without re-deriving everything from scratch.

**What kicked this off:** on 2026-08-08, a real production bug was found
and fixed — Tiller bank-sync duplicated transactions whenever a bank's
reported date shifted between pending and posted (see §3 for the full
story). The owner reasonably assumed that meant more bugs of a similar
shape are probably still lurking, and wants a deliberate, thorough pass
looking for them — not just "does it compile," but "where else does this
app's design create room for silent, hard-to-notice mistakes on real
financial data."

---

## 1. Read these first, in order

1. `CLAUDE.md` (repo root) — the project charter. Read this whole file
   before touching anything. It encodes hard-won rules (e.g. "Category
   determines Type, never a separate field" — a rule that was violated
   once already in the original build and caused real data corruption).
   Any finding that would violate a rule stated here should be flagged as
   high severity even if the code "works."
2. `HANDOFF.md` (repo root) — the living engineering log. Section 5
   ("Important constraints, decisions, and data model rules") lists
   several sharp edges already discovered the hard way — don't re-report
   these as new findings, but DO check whether the documented mitigation
   is actually still correct and complete.
3. `gm-money-web/supabase/schema.sql` — documents the real (adopted, not
   authored-from-scratch) database schema. It's descriptive, not a script
   to run.
4. This document, in full, before starting.

**Scope:** the live system is `gm-money-web/` (Next.js 14 + Supabase).
The old Google Apps Script system (`app-script-backend/`,
`gm-money-frontend/`) still exists in the repo and still runs
`TillerSync.gs` (the bank-sync sender), but per HANDOFF.md §9 its
UI-facing status is unresolved — don't assume it's dead, but the primary
audit target is `gm-money-web/`.

---

## 2. What "done" looks like

A written report (markdown is fine) with findings grouped by severity
(Critical / High / Medium / Low), each with:
- **What's wrong** — concrete, not vague ("X can silently do Y under
  condition Z"), with file:line references.
- **Why it matters** — trace it to a real consequence: wrong balance,
  wrong category, data loss, security exposure, etc. "Looks off" is not
  a finding; a demonstrated failure mode is.
- **A concrete repro or reasoning trace**, not just a claim.
- **A suggested fix**, but do NOT apply fixes without the owner's
  explicit sign-off — this is real financial data for a real business in
  daily use. Read-only investigation, then a report. If asked to also
  fix things, treat each fix as its own reviewed change, not a batch.

Do not pad the report with generic best-practice advice ("add more
tests," "add TypeScript strict mode" — it's already strict) unless tied
to a specific, real risk in this codebase.

---

## 3. Context: the bug that prompted this audit (already fixed, don't re-report)

`app/api/tiller-sync/route.ts`'s upsert idempotency key
(`source_record_id`) baked in the bank-reported `transaction_date`.
Tiller commonly reports a different date for the same real purchase
between syncs (pending → posted lag). Because the date was part of the
uniqueness key, a shifted date caused the upsert to miss the existing row
and insert a duplicate — the same real transaction landing twice in the
Register, sometimes categorized two different ways. Fixed by widening the
match to account+description+amount within a 5-day window before falling
back to the exact-key upsert (see the git history / that file's comments
for the full fix). The ~13 duplicates that had already accumulated were
merged directly in the database.

**Why this matters for your audit:** the root cause was "a uniqueness/
idempotency assumption that seemed reasonable but wasn't actually true of
the real-world data." Go looking for other assumptions of that shape —
places that assume a key is stable, a value monotonic, an operation
naturally idempotent, or a race impossible — because this codebase has
already demonstrated it's willing to ship one of those.

---

## 4. Specific areas worth real scrutiny

These are informed leads from working in this codebase, not a random
checklist — treat them as a starting point, not the full scope.

1. **`lib/register.ts`'s `dedupe()` heuristic** (manual↔bank matching).
   Matches on same amount + within 7 days + at least one shared 3+
   letter word between descriptions. Consider: two genuinely different
   transactions with the same amount, close dates, and one shared common
   word (e.g. "the", or a common vendor word) — could this heuristic
   silently mismatch them and hide a real transaction? What's the actual
   blast radius if it does (wrong running balance? A real charge that
   never shows up)?

2. **The running-balance algorithm in `getRegisterData()`** — walks
   backward from the bank's raw balance through the currently-visible
   cleared sum to find an anchor, then forward. This is subtle math.
   Stress-test it on paper against edge cases: an account with zero
   cleared transactions in the visible window, an account with all-
   uncleared transactions, multiple accounts, an account whose bank
   balance snapshot is missing or stale.

3. **The new 08/01/2026 cutoff filtering** (`lib/register.ts`,
   `lib/dashboard.ts`, `lib/review.ts` — all independently hold a literal
   `CUTOFF_DATE` string that must be kept in sync by hand, no shared
   import). This is a second instance of the exact "documentation says
   'kept in sync' but nothing enforces it" pattern that's already bitten
   this project before. Is there a real risk of these drifting? Should
   they be a single shared constant instead?

4. **`app/api/tiller-sync/route.ts`'s new window-match fix itself** —
   audit the fix, not just the original bug. Could the 5-day
   account+description+amount window incorrectly merge two genuinely
   separate real transactions (e.g. a recurring subscription charged
   twice in a short window, or two different purchases from the same
   merchant for the same amount)? What happens to categorization in that
   case?

5. **Category/Type invariant enforcement** (CLAUDE.md's central rule:
   Category alone determines Income/Expense, the two must never
   disagree). Find every code path that writes `category_id` to a
   transaction (`app/entry/actions.ts`, `app/register/actions.ts`,
   `app/review/actions.ts`, `app/scheduled/actions.ts`,
   `lib/scheduled.ts`'s autopost) and confirm every single one validates
   the amount sign against the category's type server-side — not just
   client-side UI correction. Missing server-side validation on any one
   path would reopen the exact bug this rule exists to prevent.

6. **`lib/scheduled.ts`'s `processDueScheduledTransactions()`** — a
   catch-up loop (up to 180 iterations) that generates missed recurring
   transactions. Check: what happens if a schedule has been inactive for
   a very long time (thousands of iterations needed)? Is there a
   duplicate-insertion risk here similar to the Tiller bug (it does
   check for an existing row by `schedule_id` + `transaction_date` before
   inserting — is that check airtight, e.g. under concurrent cron runs)?

7. **Auth/session security** (`lib/session.ts`, `lib/app-users.ts`,
   `middleware.ts`). Custom HMAC-signed session cookie, bcrypt password
   hashing. Check: session expiry/rotation, any CSRF exposure on Server
   Actions, password reset flow (does one exist?), whether
   `middleware.ts`'s route matcher could accidentally exclude a route
   that should require auth, rate-limiting on login attempts (is there
   any?).

8. **`lib/ai-advisor.ts`'s prompt construction.** Real transaction
   descriptions (bank-controlled text, not sanitized) get embedded into
   the context JSON sent to OpenAI. Is there any realistic prompt-
   injection surface here (a bank description crafted to manipulate the
   advisor's output), and if so, does it matter given the advisor's
   output is advisory-only, not able to take actions?

9. **RLS posture** — `gm_money.*` tables have RLS enabled with zero
   policies everywhere (this is *documented as intentional* in
   `HANDOFF.md` §5.10 and `CLAUDE.md`, given the app has no Supabase Auth
   and only ever connects via `service_role`). Confirm that reasoning
   still holds — specifically, confirm no code path anywhere ever
   constructs a Supabase client with anything other than
   `SUPABASE_SERVICE_ROLE_KEY`, and that no `NEXT_PUBLIC_SUPABASE*` env
   var has been introduced anywhere in `gm-money-web/`.

10. **Error-handling patterns that swallow errors.** Search for
    `catch {` blocks with comments like "non-fatal" or "falls back
    silently." Each one is a deliberate choice, but audit whether any of
    them could mask a *real* recurring failure (e.g. the Tiller sync's
    own error logging path, `isMissingAdviceLogTable`-style error
    sniffing in `lib/ai-advisor.ts` — these string-match on Postgres
    error codes/messages, which is brittle if Supabase ever changes
    error wording).

11. **Migration `20260808024900_dedupe_shifted_date_tiller_transactions.sql`**
    (already run once against production). If this audit is happening
    after it's been in place a while, confirm no `transaction_matches`
    or `transaction_splits` rows were left dangling or double-updated by
    it — the migration was written and reviewed carefully but never
    independently audited by a second party.

12. **Secrets handling** — `TILLER_SYNC_SECRET`, `CRON_SECRET`,
    `AUTH_SECRET`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Confirm
    none are ever logged (check `console.log`/`Logger.log` calls near
    error paths in both `gm-money-web/` and `app-script-backend/`), and
    that shared-secret comparisons (`app/api/tiller-sync/route.ts`,
    `app/api/cron/route.ts`) use constant-time comparison or at least
    note if they don't (timing-attack surface, likely low real-world risk
    here but worth naming explicitly).

---

## 5. What NOT to do

- Don't propose replacing the architecture (Supabase, Next.js, Tiller,
  the custom auth). That's settled per `CLAUDE.md`'s "Architecture
  decision (already made, do not relitigate without reason)" section —
  a finding that says "use Postgres RLS + Supabase Auth properly" is fine
  and worth raising; a finding that says "rebuild this on a different
  stack" is out of scope.
- Don't apply any fix directly to the database or to production without
  the owner explicitly approving that specific change first — this is a
  real business's live bookkeeping data. Investigation and a written
  report first, always.
- Don't re-report anything already documented as a known, deliberate
  trade-off in `HANDOFF.md` §5 or `CLAUDE.md` unless you have reason to
  believe the documented mitigation is no longer actually correct.
- Don't pad the report with generic advice unconnected to a real,
  specific risk in this codebase (see §2).

---

## 6. Practical access notes

- Repo: `HydraCoreSystems/gm-money-webapp` on GitHub. The live app is in
  the `gm-money-web/` subfolder.
- Database: Supabase project `qptipjjribhwjjakmwjx` ("HydraCloud", org
  `tieikswsidaokxbitzjr`), schema `gm_money`. If you have the Supabase
  MCP connector available, `qptipjjribhwjjakmwjx` is the project ID to
  target — note this Supabase account has access to multiple unrelated
  projects (a commerce project, a "Skrybix" project); make sure you're
  pointed at the right one before running any query.
- Hosting: Vercel project `gm-money-web`, team `gathering-moss`. As of
  2026-08-08 this is connected to GitHub for auto-deploy on push to
  `main` (previously deploys were CLI-only and this caused real
  confusion — see git history around that date if curious, not relevant
  to this audit otherwise).
- If you want to run/build the app locally to test something, `npm
  install && npm run build` from `gm-money-web/` should work with no
  special setup beyond what's in `package.json`.
