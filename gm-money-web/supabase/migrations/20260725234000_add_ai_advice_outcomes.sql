alter table if exists gm_money.ai_advice_log
  add column if not exists followed boolean null,
  add column if not exists outcome_note text null,
  add column if not exists outcome_updated_at timestamptz null;
