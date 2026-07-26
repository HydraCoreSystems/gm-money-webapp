import { changePassword } from "./actions";

export const dynamic = "force-dynamic";

export default function ChangePasswordPage({
  searchParams,
}: {
  searchParams: { error?: string; success?: string };
}) {
  return (
    <div className="gm-standalone">
      <div className="gm-card">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <a href="/settings" className="gm-link-button">
            Back to settings
          </a>
        </div>
        <h2 style={{ marginTop: 0 }}>Update password</h2>
        {searchParams.success && <p className="gm-success">{searchParams.success}</p>}
        {searchParams.error && <p className="gm-error">{searchParams.error}</p>}
        <form action={changePassword}>
          <div className="gm-field">
            <label htmlFor="current_password">Current password</label>
            <input id="current_password" type="password" name="current_password" required />
          </div>
          <div className="gm-field">
            <label htmlFor="new_password">New password</label>
            <input id="new_password" type="password" name="new_password" required minLength={8} />
          </div>
          <div className="gm-field">
            <label htmlFor="confirm_password">Confirm new password</label>
            <input id="confirm_password" type="password" name="confirm_password" required minLength={8} />
          </div>
          <button className="gm-button" type="submit">
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
