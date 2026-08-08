-- Fixes the "same bank transaction shows twice in the Register" bug
-- (e.g. an Afterpay charge appearing on two different dates with two
-- different categories, both marked cleared).
--
-- Root cause: /api/tiller-sync's upsert idempotency key
-- (business_id, source, source_record_id) bakes in Tiller's reported
-- transaction_date. Tiller commonly reports a slightly different date for
-- the same real purchase between syncs (pending -> posted lag), which
-- changes source_record_id and makes the upsert insert a second row
-- instead of updating the first. The application code in
-- app/api/tiller-sync/route.ts has been fixed to match existing rows by
-- account+description+amount within a date window before deciding
-- insert vs. update, so this bug stops recurring going forward. This
-- migration is the one-time cleanup for duplicates that already
-- accumulated in the live data before that fix.
--
-- Run the SELECT below first against the real database to review exactly
-- which rows this would merge before running the DELETE further down --
-- this touches real financial records and is not something to run blind.

-- ============================================================
-- Preview: duplicate groups this migration will collapse.
-- (tiller rows, same account, same normalized description, same amount,
-- within 5 days of each other)
-- ============================================================
-- with ordered as (
--   select id, business_id, account_id, transaction_date, description, amount,
--          category_id, source_record_id,
--          lower(trim(description)) as norm_desc,
--          lag(transaction_date) over (
--            partition by business_id, account_id, lower(trim(description)), amount
--            order by transaction_date, id
--          ) as prev_date
--   from gm_money.transactions
--   where source = 'tiller'
-- ),
-- grouped as (
--   select *,
--     sum(case when prev_date is null or transaction_date - prev_date > 5 then 1 else 0 end)
--       over (partition by business_id, account_id, norm_desc, amount order by transaction_date, id) as grp
--   from ordered
-- )
-- select business_id, account_id, norm_desc, amount, grp, count(*), array_agg(id order by transaction_date)
-- from grouped
-- group by business_id, account_id, norm_desc, amount, grp
-- having count(*) > 1
-- order by 1, 2, 3;

-- Identify duplicate groups and pick one survivor per group: prefer a
-- row that already has a category assigned (most likely to be the one
-- the owner actually reviewed), tie-broken by earliest transaction_date
-- then earliest id.
create temporary table tiller_dupe_groups on commit drop as
with ordered as (
  select id, business_id, account_id, transaction_date, description, amount,
         category_id, source_record_id,
         lower(trim(description)) as norm_desc,
         lag(transaction_date) over (
           partition by business_id, account_id, lower(trim(description)), amount
           order by transaction_date, id
         ) as prev_date
  from gm_money.transactions
  where source = 'tiller'
),
grouped as (
  select *,
    sum(case when prev_date is null or transaction_date - prev_date > 5 then 1 else 0 end)
      over (partition by business_id, account_id, norm_desc, amount order by transaction_date, id) as grp
  from ordered
),
ranked as (
  select *,
    row_number() over (
      partition by business_id, account_id, norm_desc, amount, grp
      order by (category_id is null) asc, transaction_date asc, id asc
    ) as rn,
    count(*) over (partition by business_id, account_id, norm_desc, amount, grp) as group_size
  from grouped
)
select * from ranked where group_size > 1;

-- Survivor row per group (rn = 1).
create temporary table tiller_dupe_survivors on commit drop as
select business_id, account_id, norm_desc, amount, grp, id as survivor_id, category_id
from tiller_dupe_groups
where rn = 1;

-- If the survivor has no category but a loser in its group does, carry
-- the categorization over so the merge doesn't silently lose a real
-- categorization decision.
update gm_money.transactions t
set category_id = losers.category_id
from (
  select s.survivor_id, l.category_id
  from tiller_dupe_survivors s
  join tiller_dupe_groups l
    on l.business_id = s.business_id and l.account_id = s.account_id
   and l.norm_desc = s.norm_desc and l.amount = s.amount and l.grp = s.grp
  where l.rn > 1 and l.category_id is not null
) losers
where t.id = losers.survivor_id
  and t.category_id is null;

-- Repoint any transaction_matches referencing a loser row's id as its
-- bank_transaction_id onto the survivor instead, so reconciliation links
-- aren't silently broken by the delete below. If the survivor already
-- has its own match, just drop the loser's (can't have two matches
-- pointing at the same real-world bank row).
delete from gm_money.transaction_matches m
using tiller_dupe_groups l, tiller_dupe_survivors s
where l.rn > 1
  and m.bank_transaction_id = l.id
  and l.business_id = s.business_id and l.account_id = s.account_id
  and l.norm_desc = s.norm_desc and l.amount = s.amount and l.grp = s.grp
  and exists (
    select 1 from gm_money.transaction_matches m2
    where m2.bank_transaction_id = s.survivor_id
  );

update gm_money.transaction_matches m
set bank_transaction_id = s.survivor_id
from tiller_dupe_groups l, tiller_dupe_survivors s
where l.rn > 1
  and m.bank_transaction_id = l.id
  and l.business_id = s.business_id and l.account_id = s.account_id
  and l.norm_desc = s.norm_desc and l.amount = s.amount and l.grp = s.grp;

-- Repoint any transaction_splits off a loser row onto its survivor.
update gm_money.transaction_splits sp
set transaction_id = s.survivor_id
from tiller_dupe_groups l, tiller_dupe_survivors s
where l.rn > 1
  and sp.transaction_id = l.id
  and l.business_id = s.business_id and l.account_id = s.account_id
  and l.norm_desc = s.norm_desc and l.amount = s.amount and l.grp = s.grp;

-- Finally, delete the loser rows themselves.
delete from gm_money.transactions t
using tiller_dupe_groups l
where l.rn > 1 and t.id = l.id;
