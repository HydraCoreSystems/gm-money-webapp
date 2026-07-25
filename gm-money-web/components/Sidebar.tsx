import { cookies } from "next/headers";
import { ENTERED_BY_COOKIE_NAME } from "@/lib/session";
import { logout } from "@/app/login/actions";

// Minimal port of gm-money-frontend/src/layout/Sidebar.tsx -- only
// "Dashboard" is a real, built screen so far, so that's the only nav item
// shown for now rather than linking to screens that don't exist yet.
// Expand NAV_ITEMS as Register/Entry/etc. get built in gm-money-web.
const NAV_ITEMS: { href: string; label: string; icon: string }[] = [{ href: "/", label: "Dashboard", icon: "●" }];

export function Sidebar() {
  const enteredBy = cookies().get(ENTERED_BY_COOKIE_NAME)?.value;

  return (
    <aside className="gm-sidebar">
      <div className="gm-brand-lockup">
        <div className="gm-brand-mark">GM</div>
        <div>
          <strong>Gathering Moss</strong>
          <span>Financial Center</span>
        </div>
      </div>

      <nav className="gm-sidebar-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <a key={item.href} href={item.href} className="gm-sidebar-nav__item gm-sidebar-nav__item--active">
            <span className="gm-nav-ic" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      <div className="gm-sidebar-spacer" />

      {enteredBy && (
        <div className="gm-sidebar-user">
          <div
            aria-hidden="true"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg, #17372a, #2f5d45)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 12,
              flex: "0 0 auto",
            }}
          >
            {enteredBy.charAt(0).toUpperCase()}
          </div>
          <div>
            <strong>{enteredBy}</strong>
            <span>Signed in</span>
          </div>
          <form action={logout}>
            <button type="submit" className="gm-sidebar-switch">
              Log out
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
