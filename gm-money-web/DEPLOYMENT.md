# Deployment notes

**Deploys are manual.** `git push` alone does not deploy this app —
always follow a code change with:

```
git add -A && git commit -m "..." && git push origin main
npx vercel --prod
```

## Required environment variables

Set these in Vercel (already set in Production as of 2026-07-27):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_SECRET`
- `CRON_SECRET`
- `TILLER_SYNC_SECRET` — must exactly match the value set in the Apps
  Script project's Script Properties (Project Settings → Script
  Properties in the Apps Script editor). If ever rotated, update both
  sides.
- `OPENAI_API_KEY`, `OPENAI_MODEL` — powers the "Ask GM Money" advisor
  (`lib/ai-advisor.ts`). Only called on-demand (a question actually
  submitted), not on page load.

## Production checklist (first-time setup only — already done)

1. Deploy the app to Vercel.
2. Configure the environment variables above.
3. Ensure the `gm_money` schema is exposed in Supabase (Settings → API →
   Exposed schemas).
4. Visit `/setup` to create the first owner account (self-registration,
   not a script — the old `scripts/seed-site-auth.mjs` was for the
   earlier single-shared-password design and is no longer the real path).
5. Cron is already configured via `vercel.json` (`/api/cron`, daily at
   6:15am) — nothing to add manually.
6. Tiller sync is already running: `app-script-backend/TillerSync.gs` on
   a 15-minute Apps Script trigger, pushing to `/api/tiller-sync`. If it
   ever needs reinstalling, run `installTillerSyncTrigger()` once from
   the Apps Script editor after setting `TILLER_SYNC_URL` and
   `TILLER_SYNC_SECRET` in Script Properties.

## Health checks

- `/api/health`
- `/login`
