import { redirect } from "next/navigation";
import { getAppUserCount } from "@/lib/app-users";
import { completeFirstTimeSetup } from "./actions";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const userCount = await getAppUserCount();
  if (userCount > 0) {
    redirect("/login");
  }

  return (
    <div className="gm-standalone">
      <div className="gm-card">
        <div className="gm-brand-lockup" style={{ padding: "0 0 24px" }}>
          <div className="gm-brand-mark">GM</div>
          <div>
            <strong style={{ color: "var(--ink)" }}>GM Money 2026</strong>
            <span style={{ color: "var(--muted)" }}>First-time setup</span>
          </div>
        </div>

        <h2 style={{ marginTop: 0 }}>Create owner account</h2>
        <p className="gm-register-note" style={{ marginTop: 0 }}>
          This account will manage users and settings for GM Money 2026.
        </p>

        {searchParams.error && <p className="gm-error">{searchParams.error}</p>}

        <form action={completeFirstTimeSetup}>
          <div className="gm-field">
            <label htmlFor="displayName">Your name</label>
            <input id="displayName" name="displayName" required autoFocus />
          </div>
          <div className="gm-field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="gm-field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" minLength={8} required />
          </div>
          <div className="gm-field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input id="confirmPassword" name="confirmPassword" type="password" minLength={8} required />
          </div>
          <button className="gm-button" type="submit">
            Finish setup
          </button>
        </form>
      </div>
    </div>
  );
}
