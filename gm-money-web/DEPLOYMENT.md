# Deployment notes

## Required environment variables

Set these in Vercel or your hosting platform:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- AUTH_SECRET
- CRON_SECRET
- TILLER_SYNC_SECRET

## Production checklist

1. Deploy the app to Vercel/Netlify.
2. Configure the environment variables above.
3. Ensure the Supabase schema is exposed in the gm_money schema.
4. Seed the initial password hash with the supplied script.
5. Add a cron job or scheduled task to call /api/cron?secret=... once per day.
6. Configure your sync job to POST to /api/tiller-sync?secret=... with the expected payload.

## Health checks

- /api/health
- /login
