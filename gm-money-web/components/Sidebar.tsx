import { cookies } from "next/headers";
import { ENTERED_BY_COOKIE_NAME } from "@/lib/session";
import { logout } from "@/app/login/actions";

// Minimal port of gm-money-frontend/src/layout/Sidebar.tsx -- only real,
// built screens are listed. Expand as more of gm-money-web gets built.
const NAV_ITEMS: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "Dashboard", icon: "●" },
  { href: "/register", label: "Register", icon: "☰" },
  { href: "/entry", label: "Entry", icon: "✚" },
  { href: "/review", label: "Review", icon: "✓" },
  { href: "/scheduled", label: "Scheduled", icon: "▦" },
  { href: "/merchants", label: "Merchants", icon: "♖" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({ active }: { active: string }) {
  const enteredBy = cookies().get(ENTERED_BY_COOKIE_NAME)?.value;

  return (
    <aside className="gm-sidebar">
      <div className="gm-brand-lockup">
        <div className="gm-brand-mark">GM</div>
        <div>
          <strong>GM Money 2026</strong>
          <span>Financial Center</span>
        </div>
      </div>

      <nav className="gm-sidebar-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={item.href === active ? "gm-sidebar-nav__item gm-sidebar-nav__item--active" : "gm-sidebar-nav__item"}
          >
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
