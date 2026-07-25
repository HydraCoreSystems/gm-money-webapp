import { login } from "./actions";
import { WhoPicker } from "./WhoPicker";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
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

        <form action={login}>
          <WhoPicker />
          <div className="gm-field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" name="password" required autoFocus />
          </div>
          <button className="gm-button" type="submit">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
