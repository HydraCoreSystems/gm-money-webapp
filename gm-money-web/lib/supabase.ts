import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

// Forces every Supabase request through with cache: "no-store" explicitly.
// Confirmed live in production that two Supabase queries fired concurrently
// (via Promise.all, same client instance) could have one of them silently
// come back empty -- no error, wrong data -- while a raw fetch() to the
// identical endpoint in the same execution returned correctly. Next.js's
// automatic fetch caching/deduplication layer is the leading suspect (it
// patches the global fetch reference), so this makes sure Supabase's HTTP
// calls can never be served from or merged into that cache, regardless of
// which fetch implementation supabase-js ends up resolving internally.
function noStoreFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, cache: "no-store" });
}

// Scoped to the gm_money schema (not `public`) so this app's tables can
// share a Supabase project with another app (HydraCloud) without any name
// collisions. Requires `gm_money` to be added to Settings -> API ->
// Exposed schemas in the Supabase dashboard, or every query 404s.
//
// This schema was NOT designed by this project -- it was already built
// and populated by a prior ChatGPT session before this one started (see
// HANDOFF.md's "MAJOR PIVOT" note). Adopted as-is rather than replaced.
export function getSupabaseServerClient() {
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, { db: { schema: "gm_money" }, global: { fetch: noStoreFetch } });
}

// A server client that targets the public schema. Use this for small
// compatibility queries that must hit public views (e.g. a proxy view).
export function getSupabaseServerClientPublic() {
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, { global: { fetch: noStoreFetch } });
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
