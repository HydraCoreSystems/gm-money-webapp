# Shared Supabase Project Boundary

## Project Identity

- **Supabase project ref:** `zaqzlzofgmgvepbcjrut`
- **Current display name:** Skrybix
- **Account/organization:** Gathering Moss
- **Recommended display name:** Skrybix + Financial Center (do not rename without owner approval)
- **Notes:** This is a **shared** project. It hosts multiple applications. No single application may claim ownership of the schema.

## Table Classification (read-only inventory as of 2026-08-21)

### Financial Center Tables (11)

| Table | Rows | Notes |
|:------|:-----|:------|
| `accounts` | 3 | Checking ($754.82), Savings ($0), Cash ($0). All opening_balance = $0. |
| `categories` | 9 | Missing Banking & Fees, Taxes & Licenses, Utilities vs seed (11). |
| `subcategories` | 1 | Only "Plant and Product Sales" under Income. Seed had 30+. |
| `transactions` | 26 | 14 unique + 12 exact duplicates. All account_id=1. All empty fingerprint. All approved. |
| `merchant_memory` | 0 | No rules. Seed had 11. |
| `scheduled_transactions` | 0 | Empty. |
| `transaction_splits` | 0 | Empty. |
| `transaction_attachments` | 0 | Empty. |
| `reconciliations` | 0 | Empty. |
| `import_history` | — | **Table does not exist.** Migration will create it. |
| `import_profiles` | — | **Table does not exist.** Migration will create it. |

### Tables the migration creates (2)

| Table | Created by `CREATE TABLE IF NOT EXISTS` |
|:------|:----------------------------------------|
| `fc_members` | Yes — owner membership, references `auth.users` |
| `import_history` | Yes |
| `import_profiles` | Yes |

### Core Skrybix Tables

| Table | Rows | Notes |
|:------|:-----|:------|
| `marketplace_brand_profiles` | 0 | Exists, empty. Must remain untouched. |

### Legacy / Unused

No other tables found via REST endpoint probing.

## Migration Safety Rules

The Financial Center migration (`supabase/migrations/001_enable_rls_financial_center.sql`) follows these rules:

1. **Never uses schema-wide grants or revocations.** All GRANT/REVOKE statements target specific FC-owned tables, sequences, and functions.
2. **Never drops, renames, or truncates any table.** All DDL uses `CREATE ... IF NOT EXISTS`, `ALTER ... ADD COLUMN IF NOT EXISTS`, `ADD CONSTRAINT IF NOT EXISTS`.
3. **Never modifies `auth` schema objects** except for the `fc_members` table which references `auth.users(id)` via foreign key.
4. **Never touches `marketplace_brand_profiles`** or any future Skrybix table.
5. **Uses `fc_` prefix** for all newly created functions and helper routines. Helper functions are dropped after use.
6. **RLS policies target Financial Center tables only** via an explicit table list, guarded by `IF EXISTS` checks.
7. **Sequence grants use `pg_get_serial_sequence`** to target only FC-owned identity sequences, never `ALL SEQUENCES`.

## Migration Impact Assessment

Applying `001_enable_rls_financial_center.sql` to production would:

| Action | Affected objects | Skrybix impact |
|:-------|:-----------------|:---------------|
| Create `fc_members` table | 1 new table | None |
| Create `import_history` table | 1 new table | None |
| Create `import_profiles` table | 1 new table | None |
| Add `fingerprint` column to `transactions` | 1 existing FC column | None |
| Add `import_id` column to `transactions` | 1 existing FC column | None |
| Add unique constraint on `transactions.fingerprint` | 1 existing FC constraint | None (audited: no duplicates yet — column is empty) |
| Create indexes on FC tables | 8 existing/new FC indexes | None |
| Add foreign keys | 3 FK constraints on FC tables | None |
| Enable RLS on 11 existing + 3 new FC tables | 14 tables | None |
| Create 45 RLS policies (TO authenticated) | 14 tables | None |
| Grant table/sequence privileges to `authenticated` | 11 FC tables + sequences | None |
| Revoke from `anon`/`PUBLIC` on FC objects | 11 FC tables + sequences | None |
| Create `fc_import_transactions` RPC function | 1 new function | None |
| Lock down RPC (REVOKE FROM PUBLIC/anon, GRANT TO authenticated) | 1 function | None |

**Zero Skrybix objects are modified.**

## Data Prerequisites

Before applying the migration, the following must be addressed:

1. **Fingerprint unique constraint**: The `transactions.fingerprint` column is empty (all null). The migration's duplicate audit will find 0 duplicates, pass, and add the constraint without issue.
2. **Duplicate transaction rows**: 12 exact duplicates (IDs 64-75 mirror 50-61). These have empty fingerprints and won't block the unique constraint. They remain until a dedicated cleanup pass.
3. **Account opening balances**: All 3 accounts have `opening_balance = $0.00`. The migration does not set or modify balances. This must be addressed separately.
4. **Auth users**: Phil and Crystal need `auth.users` entries. Their UUIDs must be inserted into `fc_members` after migration to activate access.

## Verification Checklist (post-deployment)

- [ ] Migration applied without errors
- [ ] `import_history` and `import_profiles` tables exist
- [ ] `transactions.fingerprint` column exists with unique constraint
- [ ] `transactions.import_id` column exists
- [ ] All FC tables have RLS enabled (12 tables)
- [ ] All FC policies are `TO authenticated`
- [ ] Anonymous cannot SELECT from `accounts` (returns 0 rows)
- [ ] Phil can SELECT from `accounts` after enrollment
- [ ] Crystal can SELECT from `accounts` after enrollment
- [ ] Neither Phil nor Crystal can INSERT into `fc_members`
- [ ] `fc_import_transactions` RPC is executable by authenticated only
- [ ] `marketplace_brand_profiles` table untouched (same grants, same data)
- [ ] JSON backup downloaded before and after for rollback
