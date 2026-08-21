# Gathering Moss Financial Center — Stabilization Implementation Plan

## Status: Beta Recovery (In Progress)

---

## Completed Recovery Work

### Pass 1: Data Safety & Invariants (commit `6445bed`)
- Removed write-on-read auto-heal from `getAccounts()` that reassigned all transactions to Checking
- Removed global `delete().eq('amount', 0)` from `processImport()`
- Enforced exact cent arithmetic (`toCents`/`fromCents`) in `recalculateBalance()`
- Fixed backup button to use client-side JSON snapshot instead of 404 endpoint
- Preserved institution field instead of forcing "PNC Bank"

### Pass 2: Modular Client Services & Auth (current recovery)
**New files:**
- `client/js/services/utils.js` — Pure functions: safeFloat, toCents, fromCents, extractAmount, parseCSV, detectCSVProfile, normalizeDate, normalizeDescription, determineType, formatPayee
- `client/js/services/supabaseClient.js` — Supabase client re-exporting utils (adopted & enhanced from Antigravity untracked work)
- `client/js/services/fingerprint.js` — SHA-256 deterministic fingerprint generation via Web Crypto
- `client/js/services/auth.js` — Supabase Auth wrapper (email/password sign-in/out, session management)
- `supabase/migrations/001_enable_rls_financial_center.sql` — Repeatable RLS policy migration for all 11 Financial Center tables

**Modified files:**
- `client/js/api.js` — Refactored to import from services modules; PNC header-based CSV parsing; fingerprint-based deduplication; review queue routing; import history tracking; date-range-filtered reports; register running balances
- `client/js/app.js` — Authentication gating: unauthenticated users see login screen only; logout support; error boundaries on all views
- `client/index.html` — Added logout button to top bar
- `package.json` — Added `test:client` and `test:all` scripts
- `tests/test_client_services.js` — 11 tests for pure client functions (PNC parsing, cent arithmetic, fingerprinting, description normalization, date handling, type determination, balance calc)

### PNC CSV Import Restored
- Header-based detection: `Transaction Date`, `Transaction Description`, `Amount` → PNC profile
- Pending transaction date parsing: `"PENDING - 08/19/2026"` → `2026-08-19`
- Amount parsing: `"- $13.9"`, `"+ $110.70"`, `"$4"` with variable decimal places
- SHA-256 fingerprint deduplication: `accountId|date|abs(amount)|normalizedPayee`
- Low-confidence imports (< 0.7 confidence) routed to `pending_review`
- Import history tracked via `import_history` table

---

## Tests Passing

```
npm run test:all
```
- **SQLite tests** (test_all.js): 7 tests — accounts, CSV import, dedup, splits, attachments, batch ops, backup
- **Client tests** (test_client_services.js): 11 tests — safeFloat, toCents, extractAmount, parseCSV, detectCSVProfile, normalizeDate, normalizeDescription, determineType, fingerprint, formatPayee, balance calc

---

## Remaining Work & Known Limitations

### Before Production Deployment
1. **Apply RLS migrations**: Run `supabase/migrations/001_enable_rls_financial_center.sql` in Supabase SQL Editor
2. **Create owner user**: Add owner email/password in Supabase Authentication dashboard
3. **Seed merchant memory**: The live Supabase has 0 merchant rules. Push the seed rules from `server/db.js`
4. **Seed categories/subcategories**: Live Supabase has only 9 categories and 1 subcategory vs the 11 categories with 30+ subcategories in seed data
5. **Duplicate cleanup**: 12 duplicate transaction rows (IDs 64-75) need removal after dry-run approval

### Beta Limitations (Non-blocking)
| Issue | Severity | Notes |
|:------|:---------|:------|
| Account opening balances zeroed | Critical | Auto-heal bug wiped opening balances on live DB; needs restoration |
| No sub-table for splits/attachments in Supabase client | Medium | API stubs return empty arrays; tables exist but CRUD not implemented |
| Description normalization noise | Low | Short 3-char suffix `xxx` and state codes not always stripped; PNC desc quality acceptable |
| PNC pending dates use US format only | Low | If PNCExport has different date locale, add profile option |
| Backup is JSON blob only | Low | No server-side backup restore; client-side download works |
| ![IMAGE](None) | | |

### Commercial Ledger Integration Boundary
The `gm-commerce` project and Commercial Ledger integration are out of scope. A clean boundary exists:
- Financial Center: transaction records, reconciliation, P&L
- Commerce: orders, inventory, fulfillment
- Future integration: reconcile Financial Center transactions against Commerce settlement reports

---

## Production Deployment Sequence

1. **Apply RLS migration** in Supabase SQL Editor (file: `supabase/migrations/001_enable_rls_financial_center.sql`)
2. **Create owner user** in Supabase Auth dashboard  
3. **Seed merchant memory** and **seed categories/subcategories** in Supabase
4. **Deploy to Vercel** from `recovery/financial-center-stabilization` branch
5. **Verify login flow**: Confirm anonymous access returns 0 rows from all tables; authenticated owner can read/write
6. **Run import test**: Import the PNC CSV, verify deduplication and review queue
7. **Approve duplicate cleanup dry-run** before executing deletion of IDs 64-75

---

## File Inventory (Recovery Branch)

```
client/
  index.html                    (modified: +logout button)
  js/
    api.js                      (refactored: imports from services, PNC support, fingerprint dedup, review routing)
    app.js                      (modified: auth gating, logout, error boundaries)
    modals.js                   (unchanged)
    services/
      auth.js                   (new: Supabase Auth wrapper)
      fingerprint.js            (new: SHA-256 fingerprint via Web Crypto)
      supabaseClient.js         (adopted & enhanced: re-exports from utils)
      utils.js                  (new: pure utility functions, no deps)
    views/                      (unchanged)
supabase/
  migrations/
    001_enable_rls_financial_center.sql  (new: repeatable RLS policy migration)
tests/
  test_all.js                   (unchanged: SQLite tests)
  test_client_services.js       (new: 11 client service tests)
package.json                    (modified: +test:client, +test:all)
```
