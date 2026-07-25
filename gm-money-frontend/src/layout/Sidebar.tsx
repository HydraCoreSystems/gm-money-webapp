import type { ReactNode } from "react";
import { Avatar } from "../features/shared/Avatar";
import type { Screen } from "../App";

type NavItem = { screen: Screen; label: string; icon: ReactNode };

const NAV_ITEMS: NavItem[] = [
  { screen: "dashboard", label: "Dashboard", icon: "●" },
  { screen: "entry", label: "Entry", icon: "✚" },
  { screen: "register", label: "Register", icon: "☰" },
  { screen: "review", label: "Review", icon: "✓" },
  { screen: "scheduled", label: "Scheduled", icon: "▦" },
  { screen: "merchants", label: "Merchants", icon: "♖" },
  { screen: "settings", label: "Settings", icon: "⚙" },
];

type Props = {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  /** Nav items are hidden (not just disabled) while form options are loading/erroring, matching the app's prior behavior. */
  showNav: boolean;
  enteredBy: string;
  onSwitch: () => void;
};

export function Sidebar({ screen, onNavigate, showNav, enteredBy, onSwitch }: Props) {
  return (
    <aside className="gm-sidebar">
      <div className="gm-brand-lockup">
        <div className="gm-brand-mark">GM</div>
        <div>
          <strong>Gathering Moss</strong>
          <span>Financial Center</span>
        </div>
      </div>

      {showNav && (
        <nav className="gm-sidebar-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.screen}
              type="button"
              className={
                item.screen === screen
                  ? "gm-sidebar-nav__item gm-sidebar-nav__item--active"
                  : "gm-sidebar-nav__item"
              }
              onClick={() => onNavigate(item.screen)}
              aria-current={item.screen === screen ? "page" : undefined}
            >
              <span className="gm-nav-ic" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="gm-sidebar-spacer" />

      {enteredBy && (
        <div className="gm-sidebar-user">
          <Avatar label={enteredBy} size={30} />
          <div>
            <strong>{enteredBy}</strong>
            <span>Signed in</span>
          </div>
          <button type="button" className="gm-sidebar-switch" onClick={onSwitch}>
            Switch
          </button>
        </div>
      )}
    </aside>
  );
}
