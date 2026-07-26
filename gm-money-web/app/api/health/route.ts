import { NextResponse } from "next/server";

export async function GET() {
  const authConfigured = Boolean(process.env.AUTH_SECRET);
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const cronConfigured = Boolean(process.env.CRON_SECRET);
  const tillerSyncConfigured = Boolean(process.env.TILLER_SYNC_SECRET);

  return NextResponse.json({
    ok: true,
    service: "gm-money-web",
    timestamp: new Date().toISOString(),
    checks: {
      authConfigured,
      supabaseConfigured,
      cronConfigured,
      tillerSyncConfigured,
    },
  });
}
