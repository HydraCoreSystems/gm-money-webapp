import { createClient } from "@supabase/supabase-js";

// Scoped to the gm_money schema (not `public`) so this app's tables can
// share a Supabase project with another app (HydraCloud) without any name
// collisions. Requires `gm_money` to be added to Settings -> API ->
// Exposed schemas in the Supabase dashboard, or every query 404s.
export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  return createClient(url, serviceRoleKey, { db: { schema: "gm_money" } });
}
