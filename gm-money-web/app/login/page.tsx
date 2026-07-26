import { login } from "./actions";
import { getAppUserCount } from "@/lib/app-users";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const userCount = await getAppUserCount();

  return (
    <div className="gm-standalone">
      <div className="gm-card">
        <div className="gm-brand-lockup" style={{ padding: "0 0 24px" }}>
          <div className="gm-brand-mark">GM</div>
          <div>
            <strong style={{ color: "var(--ink)" }}>Gathering Moss</strong>
            <span style={{ color: "var(--muted)" }}>Financial Center</span>
          </div>
        </div>

        {searchParams.error && <p className="gm-error">{searchParams.error}</p>}

        {userCount === 0 && (
          <p className="gm-register-note" style={{ marginTop: 0 }}>
            No users are configured yet. <a href="/setup">Run first-time setup</a>.
          </p>
        )}

        <form action={login}>
          <div className="gm-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" name="email" required autoFocus />
          </div>
          <div className="gm-field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" name="password" required />
          </div>
          <button className="gm-button" type="submit">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
