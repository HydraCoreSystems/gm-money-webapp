-- Supabase's security advisor flagged 4 tables with RLS disabled entirely
-- (sync_events, ai_advice_log, notification_recipients, app_users) --
-- meaning the public anon/authenticated Postgres roles could read or
-- write them directly via PostgREST if an anon key were ever issued,
-- fully bypassing the app.
--
-- This app never issues an anon key (no NEXT_PUBLIC_SUPABASE_ANON_KEY
-- anywhere in gm-money-web) and only ever connects with the service_role
-- key, server-side (lib/supabase.ts) -- service_role bypasses RLS
-- regardless of policies. So enabling RLS here with NO policies (default
-- deny for every role except service_role) closes the hole without
-- affecting the app's own access at all.
--
-- Deliberately NOT adding auth.uid()-style policies: this app's login is
-- fully custom (app_users + bcrypt + a self-signed session cookie, see
-- lib/app-users.ts / lib/session.ts), not Supabase Auth, so no request
-- this app makes ever carries a Supabase JWT -- auth.uid() would always
-- be null. Real per-row RLS policies would need Supabase Auth (or scoped
-- JWTs) as a prerequisite; see HANDOFF.md §5.10 for the full rationale.
alter table gm_money.sync_events enable row level security;
alter table gm_money.ai_advice_log enable row level security;
alter table gm_money.notification_recipients enable row level security;
alter table gm_money.app_users enable row level security;
