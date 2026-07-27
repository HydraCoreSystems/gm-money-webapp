import { Sidebar } from "@/components/Sidebar";
import { listAppUsers } from "@/lib/app-users";
import { getSessionClaims } from "@/lib/auth-session";
import { activateRegisteredUser, addRegisteredUser, deactivateRegisteredUser } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage({
  searchParams,
}: {
  searchParams: { error?: string; success?: string };
}) {
  const users = await listAppUsers();
  const claims = await getSessionClaims();
  const canManage = claims?.role === "owner" || claims?.role === "admin";

  return (
    <div className="gm-shell">
      <Sidebar active="/settings" />

      <div className="gm-workspace">
        <header className="gm-topbar">
          <div>
            <p className="gm-topbar__breadcrumb">Gathering Moss / Settings / Users</p>
            <h1>User accounts</h1>
            <p className="gm-topbar__lead">Manage registered users and access for GM Money 2026.</p>
          </div>
        </header>

        <div className="gm-card gm-card--wide" style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="gm-panel-head" style={{ padding: "20px 22px 14px", display: "flex", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>Registered users</h2>
            <a href="/settings" className="gm-link-button">Back to settings</a>
          </div>

          <div style={{ padding: "0 22px 22px" }}>
            {searchParams.success && <p className="gm-success">{searchParams.success}</p>}
            {searchParams.error && <p className="gm-error">{searchParams.error}</p>}

            {canManage ? (
              <form action={addRegisteredUser} className="gm-settings-add-row" style={{ marginBottom: 14 }}>
                <input name="displayName" placeholder="Name" required />
                <input type="email" name="email" placeholder="Email" required />
                <input type="password" name="password" placeholder="Temporary password" minLength={8} required />
                <select name="role" defaultValue="member">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <button type="submit" className="gm-link-button">Add user</button>
              </form>
            ) : (
              <p className="gm-register-note">Only owners and admins can add or disable users.</p>
            )}

            <div className="gm-register-list">
              {users.length === 0 && <p className="gm-register-note">No users found.</p>}
              {users.map((user) => (
                <div key={user.id} className="gm-register-row">
                  <div className="gm-register-row__top">
                    <div className="gm-register-row__main">
                      <div className="gm-register-row__payee">{user.displayName}</div>
                      <div className="gm-register-row__meta">
                        {user.email} · {user.role} · {user.isActive ? "active" : "inactive"}
                        {user.lastLoginAt ? ` · last login ${new Date(user.lastLoginAt).toLocaleString()}` : " · never logged in"}
                      </div>
                    </div>
                    {canManage && (
                      <div className="gm-register-row__actions">
                        {user.isActive ? (
                          <form action={deactivateRegisteredUser}>
                            <input type="hidden" name="userId" value={user.id} />
                            <button className="gm-link-button" type="submit">Deactivate</button>
                          </form>
                        ) : (
                          <form action={activateRegisteredUser}>
                            <input type="hidden" name="userId" value={user.id} />
                            <button className="gm-link-button" type="submit">Activate</button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
