import { cookies } from "next/headers";
import { ENTERED_BY_COOKIE_NAME } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase";
import { logout } from "./login/actions";

export const dynamic = "force-dynamic";

async function checkConnection() {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("site_auth").select("id").limit(1);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Connected to gm_money schema." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Unknown connection error." };
  }
}

export default async function HomePage() {
  const enteredBy = cookies().get(ENTERED_BY_COOKIE_NAME)?.value;
  const connection = await checkConnection();

  return (
    <div className="gm-standalone">
      <div className="gm-card gm-card--wide">
        <h2 style={{ marginTop: 0 }}>GM Money (rebuild in progress)</h2>
        <p className="gm-register-note">
          Signed in{enteredBy ? ` as ${enteredBy}` : ""}. This is a placeholder home page for Phase 0
          of the Supabase migration -- real screens land in later phases.
        </p>
        {connection.ok ? (
          <p className="gm-success">{connection.message}</p>
        ) : (
          <p className="gm-error">
            Not connected yet: {connection.message}. Expected until the gm_money schema (Phase 1) is
            applied and exposed in Supabase's API settings.
          </p>
        )}
        <form action={logout}>
          <button className="gm-button gm-button--secondary" type="submit">
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
