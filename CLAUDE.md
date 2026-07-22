# GM Money — Web App Rebuild

## What this project is

"Gathering Moss Financial Center" (internally: GM Money) is a small-business
bookkeeping system, originally built in ChatGPT as a Google Apps Script
project living inside a Google Sheet (a customized Tiller spreadsheet). Over
one long working session, it was substantially rebuilt, debugged, and
redesigned with Claude — fixing a broken initial build, moving from a
"Business Area" model to a proper Microsoft Money-style Category →
Subcategory model, adding a unified transaction ledger, live spending/income
charts, and a full visual redesign.

The Sheets version works and is in daily use by the owner and his wife,
Crystal, who enters most transactions from her phone. It is good — but it is
still fundamentally a spreadsheet: no true responsive layout, no real
nested-category dropdown UI, occasional Apps Script rendering quirks, and a
lot of wasted screen space from Sheets' own chrome.

**The goal now: build a real web app frontend, without throwing away any of
the working backend.** Google Sheets + Tiller (bank sync) stay exactly as
they are — they become the data layer. Apps Script gets deployed as a Web
App (a real API), and a modern frontend gets built on top of it.

## Guiding philosophy

The owner's own words: **"Money with modern amenities."** He was a genuine
fan of Microsoft Money and wants this to feel like its true spiritual
successor — not a generic budgeting app, not Mint, not YNAB. Every design
and UX decision should be weighed against "how would Money have done this,"
the same tiebreaker used throughout the Sheets build.

He explicitly does not want off-the-shelf finance software (Quicken,
Actual Budget, etc.) — this needs to be custom to his actual business and
category structure.

## Architecture decision (already made, do not relitigate without reason)

- **Backend:** the existing Google Apps Script project, deployed as a Web
  App (`doGet`/`doPost` handlers), exposing the transaction/category/
  register logic already built as real API endpoints. Google Sheets remains
  the database. Tiller remains the bank-sync provider — do not replace it.
- **Frontend:** a real, separately-hosted web app (React is the presumed
  choice unless a better reason emerges) calling that API.
- **Hosting:** free/cheap static hosting for the frontend (Vercel or
  Netlify) — this was explicitly chosen over (a) serving HTML directly from
  Apps Script [too limited, would not solve the actual problem] and (b) a
  fully separate backend + database [would discard all the working Sheets
  logic for no real benefit at this stage]. Revisit hosting choice only if/
  when the owner has budget for something more robust — he was clear this
  is a "for now, until finances allow more" choice, not a permanent
  ceiling.
- **Auth:** a single shared password was chosen as a pragmatic **first
  step**, not a permanent ceiling — the owner was explicit (2026-07-21)
  that this was never meant to be a "this is how it'll always be done"
  decision. **Eventual target: real independent user accounts that share
  the same underlying data, with definable roles per person** (Phil/
  Crystal today, potentially more later). Treat this as its own future
  milestone to scope properly when the owner is ready, not as something
  permanently settled — don't cite "simple password protection is the
  decision" as a reason to push back on building real accounts later.
  Until that migration happens, the current rule still holds: the
  password must be checked **server-side by Apps Script on every
  request**, not just gated by a frontend lock screen — a frontend-only
  gate would be trivially bypassed by hitting the API URL directly.

## First milestone (build this first, get it feeling real before expanding)

**Entering a transaction end-to-end**, matching Crystal's actual daily
workflow: a mobile-friendly form, submitted through the password-protected
Apps Script API, actually writing to the real Google Sheet, with the
Category/Subcategory picker finally done properly — a true grouped/nested
selector (HTML `<optgroup>` or equivalent), which was the single biggest
recurring frustration in the Sheets version.

Do not try to build the whole app before this works end-to-end and feels
good. Get one real transaction flowing from a real browser through the API
into the real Sheet before expanding scope.

## The existing data model (do not change without good reason — a lot was learned the hard way getting this right)

### Category / Subcategory / Type

Lives in the Sheet's `Settings` tab, columns A:C: `Category | Subcategory |
Type`. Type is `Income` or `Expense`, and is a property of the **Category**,
not the subcategory — every subcategory under a given category shares the
same type. This was added specifically to solve a real, painful bug:
transactions saving with a mismatched category/type (e.g. "Sales Income"
category but "Expense" transaction type), which happened because the
original design treated category and income/expense as two independent,
unsynced fields. **In the new frontend, do not repeat that mistake** —
picking a Category should always determine Income/Expense automatically,
never be a separate user choice that can disagree with it.

The category list is user-editable and sorted Income-categories-first, then
Expense-categories-first, alphabetically within each group — the closest
approximation Sheets' flat dropdowns could get to Money's real indented
category tree. **A real frontend should do this properly**: an actual
grouped/nested selector, Income and Expense as visually distinct sections,
ideally with real indentation the way Money had it. This is explicitly
called out by the owner as the thing he's least happy with in the current
build and the thing he most wants a real web app to finally solve well.

### Manual transactions (`GM_ManualTransactions` sheet)

Columns: `Transaction ID | Date | Account | Payee | Amount | Category |
Subcategory | Payment Method | Notes | Source | Status | Matched Bank Key |
Reconciled Date | Entered By | Entered At | Schedule ID | Scheduled Due Key`

- `Amount` is signed: negative = expense, positive = income.
- `Status` is `Uncleared` (not yet confirmed against the bank) or `Cleared`
  (confirmed/matched).
- `Matched Bank Key` links a manual entry to a specific bank transaction
  once reconciled (see Register logic below) — when set, that manual row
  represents the real-world transaction and the corresponding bank row
  should never be shown as a separate duplicate.

### Bank-fed transactions (Tiller's own `Transactions` sheet)

Tiller owns this sheet and syncs it automatically. Relevant columns:
`Date | Description | Category | Amount | Account | ... | Categorized By |
Categorized Date`.

**Important constraint learned the hard way:** Tiller enforces its own
data validation on its `Category` column, restricted to whatever category
names already exist in *Tiller's own* Categories sheet — a completely
separate list from GM Money's Settings categories. Any new GM Money
category has to be auto-registered into Tiller's Categories sheet before
it can ever be written into a bank transaction's Category field, or the
write is silently rejected. If the new backend re-implements "approve a
bank transaction," it must replicate this registration step.

Bank transactions have no native concept of Subcategory (Tiller doesn't
support it) — Subcategory for an approved bank transaction lives in
`GM_TransactionMeta` instead, keyed by a deterministic transaction key:
`date|description(lowercased,trimmed)|amount(2 decimals)|account
(lowercased,trimmed)`, joined with `|`.

### Transaction metadata (`GM_TransactionMeta` sheet)

Columns: `Transaction Key | Source Row | Subcategory | Notes | Review
Status | Updated By | Updated At`. This is where Subcategory and Notes live
for bank-approved transactions, since Tiller's own sheet can't hold them.

### The unified ledger concept

The single most important piece of business logic in the whole system: a
"Register" view that merges **manual transactions and approved bank
transactions into one deduplicated, chronologically accurate list per
account** — the same way Microsoft Money's register combined manually
entered and downloaded transactions into one ledger. Getting this right was
a whole afternoon of debugging (duplicate rows, wrong running balances,
category mismatches). Any rebuild of this feature needs to replicate:

- **Deduplication:** if a manual entry has a `Matched Bank Key`, the
  corresponding bank transaction must never also appear as its own row.
- **Running balance:** the current bank balance already reflects every
  cleared transaction. The correct calculation walks backward first to find
  the implied balance *before* the currently-visible cleared transactions,
  then forward chronologically through everything (cleared and uncleared)
  so every row gets a mathematically consistent running balance — not just
  a naive running sum from zero.
- Category Type (Income/Expense) should drive spending/income totals and
  charts, **not the raw sign of the amount** — a refund on an expense
  category is still an expense-category transaction (it should net against
  that category's spending total), not income, even though its amount is
  positive.

### Merchant Memory

A learning system that maps normalized merchant/payee text to a
Category + Subcategory, with a confidence score that increases on repeated
confirmation and decreases on conflicting categorization. Feeds
auto-suggestions during transaction review. Worth preserving as a feature —
it was genuinely valuable and the owner wants it to make the new frontend
more "hands-off" over time. When a manual transaction is matched to a bank
transaction after the fact, merchant memory should be taught **both** the
clean manual payee text and the messy raw bank description — this was a
real bug that had to be fixed (only teaching the clean side meant the ugly
bank text never got recognized next time it appeared).

## Design language (amended 2026-07-21 — read this whole section, it reverses part of the original brief)

**"Money with modern amenities" means the proven functional patterns
(nested category picker, unified ledger, at-a-glance dashboard), not
Money's actual circa-2007 flat, spartan visual restraint.** Early in this
rebuild, "not a flashy consumer fintech app" and "no gradients" were taken
too literally, and the shipped result read as plain/dated rather than
calm-and-deliberate. The owner corrected this explicitly: **he wants it to
look and feel like a genuinely modern, pretty, visual app — gradients and
some real visual flashiness are wanted, not avoided** — while keeping
everything that made Money's actual mechanics great (the ledger, the
category tree, the at-a-glance dashboard). Visual restraint was never the
point; a spreadsheet-turned-app that finally looks and feels like a real,
polished 2020s product is the point.

- **Brand identity stays**: the moss/forest green palette (`#1F5A36`
  primary, `#123D25` deep header, `#2E7048` accent) is still the anchor —
  it ties to the business name ("Gathering Moss") and shouldn't be
  abandoned. But it should now be used with real visual depth: gradients,
  shadows/elevation, richer card treatment, smoother interactions — not
  flat single-color fills everywhere.
- **Gradients and "flashiness" are now explicitly wanted**, including on
  the dashboard's live-tile-style summary screen (previously specified as
  flat-color-only with no gradients — that restriction is lifted). Tiles
  can have real depth/gradient treatment now. Whether other screens
  (Entry, Register, Settings, etc.) should also pick up more visual
  richness beyond the dashboard, or whether the dashboard stays the one
  "bold" screen while the rest stay calmer-but-polished, is an open
  design question to resolve with the owner before a broad rewrite — not
  something to assume either way.
- Red for negative amounts, green for positive — still kept as functional,
  legible, conventional color, distinct from whatever the decorative
  palette becomes.

## AI / intelligence direction (added 2026-07-21 — read this before scoping ANY new feature)

The "modern amenities" half of "Money with modern amenities" is not just
visual polish (see Design language above) — the owner is explicit
(2026-07-21) that **AI intelligence is the actual point of building this
with Claude instead of hiring a generic developer**, and he considers it
under-delivered so far. His own framing: AI should function as a
**co-CFO** — not a form that stores numbers, but something that actively
reasons over the business's real data and offers guidance, flags risk,
and helps hit goals. Direct quote: "AI should be playing the role of
co-CFO and always providing guidance and thoughts on how to make our
business financially better and helping us attain our goals."

**This applies app-wide, not to one screen.** The one place real
learning/intelligence exists today is Merchant Memory (confidence-scored
auto-categorization) — genuinely valuable, but narrow. Budgeting shipped
as flat manual entry (type a number, watch a bar fill) with no use of
the 2+ years of real categorized transaction history already sitting in
the Sheet, and the owner correctly called this out as a missed
opportunity that reflects the app as a whole, not a one-off complaint
about that single feature.

**Two different tiers of "smarter," worth distinguishing when scoping
any future feature:**
1. **Data-driven smarts** — using the app's own historical data to
   suggest, predict, or flag, without a real AI model call: auto-
   suggested budgets from trailing spending, mid-month overspend-pace
   warnings, anomaly flags on unusual transactions. Free, no new
   infrastructure — the same category of thing Merchant Memory already
   does.
2. **Real LLM-backed advisory** — an actual AI model call (e.g. Claude
   via the Anthropic API, called from Apps Script) producing narrative
   guidance, answering questions in plain English, reasoning about
   progress toward the business's goals. Real new infrastructure (API
   key, per-call cost, latency) unlike everything built in this app so
   far.

The owner's "co-CFO" framing points at tier 2 as the real target —
default to treating AI-forward requests as wanting genuine LLM-backed
reasoning, not statistics dressed up as insight, unless he says
otherwise. Confirm scope and ongoing cost with him before wiring in a
real model call, the same way `MailApp`'s first real external side
effect needed his sign-off.

## Known pain points this rebuild should specifically solve

1. **The category/subcategory picker.** This is the single most-repeated
   frustration across the whole Sheets build. A real nested/grouped
   selector (Income section, Expense section, each with its categories and
   subcategories properly indented) is a top priority, not a nice-to-have.
2. **True mobile responsiveness**, not a manually-built "narrow version" of
   a desktop layout. Crystal enters most transactions on her phone.
3. **No wasted chrome.** Every pixel should be the app, not a spreadsheet's
   toolbar and formula bar.
4. **Reliable chart rendering** — Google Charts via Apps Script had several
   real quirks (silent color-index offsets, options that silently failed,
   labels that wouldn't render on single-category pies). A real charting
   library should not have these problems, but don't assume — verify.

## What NOT to do

- Do not replace Tiller. Bank sync is already solved; re-solving it (Plaid
  or similar) is out of scope unless explicitly requested later.
- Do not throw away the Google Sheet as the data store. It's the working,
  trusted source of truth today.
- Do not rebuild the whole app before the first milestone (transaction
  entry end-to-end) is solid and feels right to the owner.
- Do not let Category and Transaction Type become two independently-set
  fields again. This was a real, painful bug once already.
