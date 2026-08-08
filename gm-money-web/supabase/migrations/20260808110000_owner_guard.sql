-- Audit finding L3 (REWORKED 2026-08-08): /setup's completeFirstTimeSetup()
-- does a plain check-then-insert for the first owner account. The check
-- (getAppUserCount must be 0) and the create are two separate queries, so
-- two overlapping /setup submissions could both pass the count check
-- before either inserts, creating two owner accounts -- the original fix
-- attempt used a partial unique index enforcing "at most one owner per
-- business", but that is the WRONG constraint for this deployment: the
-- business already legitimately has more than one owner row in
-- production, and a blanket unique index would both fail to apply there
-- and forbid a future owner+admin mix in Settings->Users.
--
-- Reworked to only serialize the /setup window, where the race actually
-- exists (before ANY owner exists): a small advisory-lock function. The
-- function does the whole "does an owner already exist?" check and the
-- insert in ONE transaction behind pg_advisory_xact_lock keyed by
-- business_id, so two concurrent /setup submissions are serialized: the
-- second waits for the first to commit, then sees the owner and aborts.
-- After the first owner exists, this guard no longer constrains anything
-- -- app/users and Settings->Users are completely unaffected, and the
-- existing multi-owner state is untouched.
--
-- The lock is transaction-scoped inside the function, so it cannot leak
-- across requests and is meaningful even under connection pooling.
--
-- Code path changed to match: lib/app-users.ts createAppUser() now calls
-- this function via supabase.rpc() (for role='owner') instead of relying
-- on a raw count+insert.
--
-- SCHEMA CHANGE: requires review before applying to production. Note this
-- supersedes the earlier 20260808110000_owner_unique.sql (removed in the
-- same commit) -- if that migration was applied to any database, the DROP
-- below removes its (at-most-one-owner) index. New function + an index
-- drop of that superseded draft only; nothing else is destructive.
--
-- ============================================================
-- Preview: confirm the old at-most-one-owner index does not exist, or
-- drop it first (this function doesn't require it; the file just owns the
-- cleanup of the prior draft).
-- ============================================================
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'gm_money' and indexname = 'app_users_one_owner_per_business_uidx';

drop index if exists gm_money.app_users_one_owner_per_business_uidx;

-- Serialized first-owner claim for /setup. Returns the new owner row, or
-- raises GM_OWNER_EXISTS if an active owner already exists for the
-- business. pg_advisory_xact_lock serializes concurrent calls for the
-- same business; the second sees the first's committed owner row because
-- this whole check+insert is one transaction.
create or replace function gm_money.create_owner_user(
  p_business_id uuid,
  p_email text,
  p_display_name text,
  p_password_hash text
)
returns table (
  id uuid,
  email text,
  display_name text,
  role text
)
language plpgsql
set search_path = gm_money, public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('gm_money_owner:' || p_business_id::text, 0));

  if exists (
    select 1 from gm_money.app_users as existing_owner
    where existing_owner.business_id = p_business_id
      and existing_owner.role = 'owner'
      and existing_owner.is_active = true
  ) then
    raise exception 'GM_OWNER_EXISTS';
  end if;

  return query
    insert into gm_money.app_users as new_owner (
      business_id, email, display_name, password_hash, role, is_active, created_at, updated_at
    )
    values (
      p_business_id, p_email, p_display_name, p_password_hash, 'owner', true, now(), now()
    )
    returning new_owner.id, new_owner.email, new_owner.display_name, new_owner.role::text;
end;
$$;