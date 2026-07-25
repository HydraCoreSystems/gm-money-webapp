import { useState } from "react";
import { clearStoredPassword, getStoredEnteredBy, getStoredPassword, storeEnteredBy, storePassword } from "./api/client";
import { PasswordGate } from "./auth/PasswordGate";
import { Sidebar } from "./layout/Sidebar";
import { TransactionEntryForm } from "./features/transaction-entry/TransactionEntryForm";
import { RegisterView } from "./features/register/RegisterView";
import { ReviewView } from "./features/review/ReviewView";
import { DashboardView } from "./features/dashboard/DashboardView";
import { SettingsView } from "./features/settings/SettingsView";
import { ScheduledView } from "./features/scheduled/ScheduledView";
import { MerchantMemoryView } from "./features/merchant-memory/MerchantMemoryView";
import { useFormOptions } from "./hooks/useFormOptions";

export type Screen = "dashboard" | "entry" | "register" | "review" | "scheduled" | "merchants" | "settings";

const SCREEN_META: Record<Screen, { breadcrumb: string; heading: string; lead: string }> = {
  dashboard: {
    breadcrumb: "Gathering Moss / Dashboard",
    heading: "Dashboard",
    lead: "Your cash position, spending, and what's waiting on you.",
  },
  entry: {
    breadcrumb: "Gathering Moss / Entry",
    heading: "Add a transaction.",
    lead: "Pick a category and the type — Income or Expense — is set automatically.",
  },
  register: {
    breadcrumb: "Gathering Moss / Register",
    heading: "Register",
    lead: "Every transaction, manual and bank-fed, in one running ledger.",
  },
  review: {
    breadcrumb: "Gathering Moss / Review",
    heading: "Review",
    lead: "Confirm and categorize transactions coming in from the bank.",
  },
  scheduled: {
    breadcrumb: "Gathering Moss / Scheduled",
    heading: "Scheduled",
    lead: "Upcoming bills and recurring transactions.",
  },
  merchants: {
    breadcrumb: "Gathering Moss / Merchants",
    heading: "Merchant Memory",
    lead: "How GM Money is learning to categorize your payees.",
  },
  settings: {
    breadcrumb: "Gathering Moss / Settings",
    heading: "Settings",
    lead: "Categories, subcategories, and notification preferences.",
  },
};

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

  if (!authed) {
    return (
      <div className="gm-standalone">
        <PasswordGate onSubmit={handlePasswordSubmit} />
      </div>
    );
  }

  const meta = SCREEN_META[screen];
  const ready = status === "ready" && !!options;

  return (
    <div className="gm-shell">
      <Sidebar
        screen={screen}
        onNavigate={setScreen}
        showNav={ready}
        enteredBy={getStoredEnteredBy()}
        onSwitch={handleAuthFailure}
      />

      <div className="gm-workspace">
        <header className="gm-topbar">
          <div>
            <p className="gm-topbar__breadcrumb">{meta.breadcrumb}</p>
            <h1>{meta.heading}</h1>
            <p className="gm-topbar__lead">{meta.lead}</p>
          </div>
        </header>

        {status === "loading" && (
          <div className="gm-workspace-notice">
            <div className="gm-card">
              <p>Loading…</p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="gm-workspace-notice">
            <div className="gm-card">
              <p className="gm-error">{error || "Could not load the app."}</p>
            </div>
          </div>
        )}

        {ready && screen === "dashboard" && <DashboardView onAuthFailure={handleAuthFailure} />}

        {ready && screen === "entry" && (
          <TransactionEntryForm formOptions={options} onAuthFailure={handleAuthFailure} />
        )}

        {ready && screen === "register" && (
          <RegisterView formOptions={options} onAuthFailure={handleAuthFailure} />
        )}

        {ready && screen === "review" && <ReviewView formOptions={options} onAuthFailure={handleAuthFailure} />}

        {ready && screen === "scheduled" && (
          <ScheduledView formOptions={options} onAuthFailure={handleAuthFailure} />
        )}

        {ready && screen === "merchants" && (
          <MerchantMemoryView formOptions={options} onAuthFailure={handleAuthFailure} />
        )}

        {ready && screen === "settings" && <SettingsView onAuthFailure={handleAuthFailure} />}
      </div>
    </div>
  );
}

export default App;
