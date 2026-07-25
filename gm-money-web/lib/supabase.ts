import { createClient } from "@supabase/supabase-js";

// Scoped to the gm_money schema (not `public`) so this app's tables can
// share a Supabase project with another app (HydraCloud) without any name
// collisions. Requires `gm_money` to be added to Settings -> API ->
// Exposed schemas in the Supabase dashboard, or every query 404s.
//
// This schema was NOT designed by this project -- it was already built
// and populated by a prior ChatGPT session before this one started (see
// HANDOFF.md's "MAJOR PIVOT" note). Adopted as-is rather than replaced.
export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  return createClient(url, serviceRoleKey, { db: { schema: "gm_money" } });
}

// The one business row this schema currently holds. The schema is
// multi-tenant-ready (businesses/business_members) but there is only one
// business today -- resolving it by name rather than hardcoding its uuid
// so this keeps working if the row ever gets recreated.
export async function getBusinessId(): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("businesses").select("id").eq("name", "Gathering Moss").single();
  if (error || !data) throw new Error(error?.message || "Gathering Moss business row not found");
  return data.id;
}
