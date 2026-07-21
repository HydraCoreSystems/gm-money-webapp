import { useState } from "react";
import { clearStoredPassword, getStoredPassword, storeEnteredBy, storePassword } from "./api/client";
import { PasswordGate } from "./auth/PasswordGate";
import { TransactionEntryForm } from "./features/transaction-entry/TransactionEntryForm";
import { RegisterView } from "./features/register/RegisterView";
import { ReviewView } from "./features/review/ReviewView";
import { DashboardView } from "./features/dashboard/DashboardView";
import { useFormOptions } from "./hooks/useFormOptions";

type Screen = "dashboard" | "entry" | "register" | "review";

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

  const { status, options, error } = useFormOptions(handleAuthFailure);

  return (
    <div className="gm-app">
      <div className="gm-header-bar">Gathering Moss Financial Center</div>

      {authed && status === "ready" && options && (
        <div className="gm-nav-tabs">
          <button
            className={screen === "dashboard" ? "gm-nav-tab gm-nav-tab--active" : "gm-nav-tab"}
            onClick={() => setScreen("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={screen === "entry" ? "gm-nav-tab gm-nav-tab--active" : "gm-nav-tab"}
            onClick={() => setScreen("entry")}
          >
            Entry
          </button>
          <button
            className={screen === "register" ? "gm-nav-tab gm-nav-tab--active" : "gm-nav-tab"}
            onClick={() => setScreen("register")}
          >
            Register
          </button>
          <button
            className={screen === "review" ? "gm-nav-tab gm-nav-tab--active" : "gm-nav-tab"}
            onClick={() => setScreen("review")}
          >
            Review
          </button>
        </div>
      )}

      <div className="gm-main">
        {!authed && <PasswordGate onSubmit={handlePasswordSubmit} />}

        {authed && status === "loading" && (
          <div className="gm-card">
            <p>Loading…</p>
          </div>
        )}

        {authed && status === "error" && (
          <div className="gm-card">
            <p className="gm-error">{error || "Could not load the app."}</p>
          </div>
        )}

        {authed && status === "ready" && options && screen === "dashboard" && (
          <DashboardView onAuthFailure={handleAuthFailure} />
        )}

        {authed && status === "ready" && options && screen === "entry" && (
          <TransactionEntryForm formOptions={options} onAuthFailure={handleAuthFailure} />
        )}

        {authed && status === "ready" && options && screen === "register" && (
          <RegisterView formOptions={options} onAuthFailure={handleAuthFailure} />
        )}

        {authed && status === "ready" && options && screen === "review" && (
          <ReviewView formOptions={options} onAuthFailure={handleAuthFailure} />
        )}
      </div>
    </div>
  );
}

export default App;
