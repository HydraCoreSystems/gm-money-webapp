# Shared Supabase Project Boundary

## Project Identity

- **Supabase project ref:** `zaqzlzofgmgvepbcjrut`
- **Current display name:** Gathering Moss Financial Center
- **Account/organization:** Gathering Moss
- **Production status:** The Financial Center is the active application. Obsolete legacy Skrybix/marketplace objects exist but must not be touched without separate authorization.
- **Warning:** Do not drop, rename, or modify any legacy Skrybix/marketplace objects.

## Table Classification

### Financial Center Tables (14)

| Table | Status | Notes |
|:------|:-------|:------|
| `accounts` | Active | 3 rows. Production configuration. Must be preserved. |
| `categories` | Active | 9 rows. Production configuration. Must be preserved. |
| `subcategories` | Active | 1 row. Production configuration. Must be preserved. |
| `transactions` | Active | Fresh start applied. Zero rows. |
| `merchant_memory` | Active | Empty. |
| `scheduled_transactions` | Active | Empty. |
| `transaction_splits` | Active | Empty. |
| `transaction_attachments` | Active | Empty. |
| `reconciliations` | Active | Empty. |
| `import_history` | Created by migration | Fresh. |
| `import_profiles` | Created by migration | Fresh. |
| `fc_members` | Created by migration | Owner enrollment table. |
| `import_history_id_seq` | Auto-created | Identity sequence. |
| `import_profiles_id_seq` | Auto-created | Identity sequence. |

### Skrybix (Legacy — Do Not Touch)

| Table | Status |
|:------|:-------|
| `marketplace_brand_profiles` | Obsolete legacy. Exists, empty. Must remain as-is. |

## Migration Safety Rules

Financial Center migrations must follow these rules strictly:

1. **Never use schema-wide grants or revocations.** All `GRANT`, `REVOKE` statements target specific FC-owned tables, sequences, and functions.
2. **Never drop, rename, or truncate any table.** All DDL uses `CREATE ... IF NOT EXISTS`, `ALTER ... ADD COLUMN IF NOT EXISTS`, `ADD CONSTRAINT IF NOT EXISTS`.
3. **Never modify `auth` schema objects** except for the `fc_members` table which references `auth.users(id)` via foreign key.
4. **Never touch any table not in the FC table list** above, regardless of whether it appears empty or unused.
5. **Use `fc_` prefix** for all newly created functions and helper routines. Helper functions must be dropped after use.
6. **RLS policies target FC tables only** via an explicit table list, guarded by `IF EXISTS` checks.
7. **Sequence grants use `pg_get_serial_sequence`** to target only FC-owned identity sequences, never `ALL SEQUENCES`.
8. **Migration is repeatable** — safe to run multiple times. Uses `DROP ... IF EXISTS` + `CREATE OR REPLACE`.

## Reset Procedure

When a fresh start is required, use `deploy/production-reset.sql`:
1. The script is a single database transaction.
2. It clears only FC transactional data (transactions, splits, attachments, reconciliations).
3. It preserves all account, category, and subcategory rows with their IDs and configuration.
4. It applies the full schema/security migration.
5. It verifies post-conditions before committing.
6. If any step fails, the entire transaction rolls back.

## Verification Checklist

- [ ] No FC migration uses `ALL SEQUENCES IN SCHEMA public`
- [ ] No FC migration uses `GRANT ... TO PUBLIC`
- [ ] No FC migration drops or renames any table
- [ ] `marketplace_brand_profiles` has same grants before and after migration
- [ ] All FC tables have `TO authenticated` RLS policies
- [ ] `anon` role has zero access to FC tables (RLS + revoked grants)
