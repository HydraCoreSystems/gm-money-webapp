-- 1. Fix Settings -> notification recipients ("permission denied for
--    table notification_recipients"): the table exists but was never
--    granted to the service_role the app connects as.
grant select, insert, update, delete on gm_money.notification_recipients to service_role;

-- 2. Clean up existing duplicate balance snapshots (a few accumulated
--    from earlier manual testing of the sync endpoint) so the new unique
--    index below can actually be created. Keeps the newest row per
--    account/day, deletes the rest.
delete from gm_money.account_balance_snapshots
where id in (
  select id from (
    select id, row_number() over (
      partition by account_id, balance_date
      order by created_at desc, id desc
    ) as rn
    from gm_money.account_balance_snapshots
  ) ranked
  where rn > 1
);

-- 3. Make the Tiller sync endpoint's upserts idempotent. A 15-minute
--    recurring sync calls /api/tiller-sync repeatedly by design -- without
--    these, every run would insert the same transactions and balance
--    snapshots again as new duplicate rows (the exact bug behind the
--    Register balance being off right now, just automated and worse).
create unique index if not exists transactions_tiller_dedup_uidx
  on gm_money.transactions (business_id, source, source_record_id)
  where source_record_id is not null;

create unique index if not exists balance_snapshots_account_date_uidx
  on gm_money.account_balance_snapshots (account_id, balance_date);
