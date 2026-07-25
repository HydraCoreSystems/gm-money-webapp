import { useState } from "react";
import { clearStoredPassword, getStoredEnteredBy, getStoredPassword, storeEnteredBy, storePassword } from "./api/client";
import { PasswordGate } from "./auth/PasswordGate";
import { TransactionEntryForm } from "./features/transaction-entry/TransactionEntryForm";
import { RegisterView } from "./features/register/RegisterView";
import { ReviewView } from "./features/review/ReviewView";
import { DashboardView } from "./features/dashboard/DashboardView";
import { SettingsView } from "./features/settings/SettingsView";
import { ScheduledView } from "./features/scheduled/ScheduledView";
import { MerchantMemoryView } from "./features/merchant-memory/MerchantMemoryView";
import { useFormOptions } from "./hooks/useFormOptions";

type Screen = "dashboard" | "entry" | "register" | "review" | "scheduled" | "merchants" | "settings";

const NAV: { id: Screen; label: string; icon: string; description: string }[] = [
  { id: "dashboard", label: "Overview", icon: "⌂", description: "Cash position and financial outlook" },
  { id: "entry", label: "New transaction", icon: "+", description: "Record income or an expense" },
  { id: "register", label: "Register", icon: "≡", description: "Your complete financial ledger" },
  { id: "review", label: "Review", icon: "✓", description: "Categorize and approve bank activity" },
  { id: "scheduled", label: "Scheduled", icon: "◷", description: "Upcoming and recurring transactions" },
  { id: "merchants", label: "Merchant memory", icon: "✦", description: "Learned categorization rules" },
  { id: "settings", label: "Settings", icon: "⚙", description: "Categories, budgets, and notifications" },
];

function App() {
  const [authed, setAuthed] = useState(!!getStoredPassword());
  const [screen, setScreen] = useState<Screen>("dashboard");

  function handleAuthFailure() {
    clearStoredPassword();
    setAuthed(false);
  }

  function handlePasswordSubmit(password: string, enteredBy: string) {
    storePassword(password);
    storeEnteredBy(enteredBy);
    setAuthed(true);
  }

  const { status, options, error } = useFormOptions(authed, handleAuthFailure);
  const current = NAV.find((item) => item.id === screen) ?? NAV[0];
  const userName = getStoredEnteredBy() || "Gathering Moss";

  if (!authed) return <PasswordGate onSubmit={handlePasswordSubmit} />;

  return (
    <div className="gm-app-shell">
      <aside className="gm-sidebar">
        <div className="gm-brand-lockup">
          <div className="gm-brand-mark">GM</div>
          <div><strong>GM Money</strong><span>Financial center</span></div>
        </div>

        <nav className="gm-side-nav" aria-label="Primary navigation">
          {NAV.map((item) => (
            <button key={item.id} className={screen === item.id ? "gm-side-nav__item is-active" : "gm-side-nav__item"} onClick={() => setScreen(item.id)}>
              <span aria-hidden="true">{item.icon}</span><b>{item.label}</b>
            </button>
          ))}
        </nav>

        <div className="gm-sidebar-insight">
          <span>FINANCIAL GUIDANCE</span>
          <strong>Your books are connected</strong>
          <p>Bank activity, manual entries, schedules, and merchant learning work together.</p>
          <div><i /></div>
          <small>GM Money foundation ready</small>
        </div>

        <div className="gm-user-chip">
          <div>{userName.slice(0, 1).toUpperCase()}</div>
          <span><strong>{userName}</strong><small>Gathering Moss workspace</small></span>
        </div>
      </aside>

      <main className="gm-workspace">
        <header className="gm-workspace-header">
          <div><p>Gathering Moss / GM Money</p><h1>{current.label}</h1><span>{current.description}</span></div>
          <button className="gm-header-action" onClick={() => setScreen("entry")}>+ Add transaction</button>
        </header>

        <section className="gm-content">
          {status === "loading" && <div className="gm-card"><p>Loading your financial center…</p></div>}
          {status === "error" && <div className="gm-card"><p className="gm-error">{error || "Could not load the app."}</p></div>}
          {status === "ready" && options && screen === "dashboard" && <DashboardView onAuthFailure={handleAuthFailure} />}
          {status === "ready" && options && screen === "entry" && <TransactionEntryForm formOptions={options} onAuthFailure={handleAuthFailure} />}
          {status === "ready" && options && screen === "register" && <RegisterView formOptions={options} onAuthFailure={handleAuthFailure} />}
          {status === "ready" && options && screen === "review" && <ReviewView formOptions={options} onAuthFailure={handleAuthFailure} />}
          {status === "ready" && options && screen === "scheduled" && <ScheduledView formOptions={options} onAuthFailure={handleAuthFailure} />}
          {status === "ready" && options && screen === "merchants" && <MerchantMemoryView formOptions={options} onAuthFailure={handleAuthFailure} />}
          {status === "ready" && options && screen === "settings" && <SettingsView onAuthFailure={handleAuthFailure} />}
        </section>
      </main>
    </div>
  );
}

export default App;
