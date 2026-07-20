import { useState } from "react";
import { clearStoredPassword, getStoredPassword, storeEnteredBy, storePassword } from "./api/client";
import { PasswordGate } from "./auth/PasswordGate";
import { TransactionEntryForm } from "./features/transaction-entry/TransactionEntryForm";

function App() {
  const [authed, setAuthed] = useState(!!getStoredPassword());

  function handleAuthFailure() {
    clearStoredPassword();
    setAuthed(false);
  }

  function handlePasswordSubmit(password: string, enteredBy: string) {
    storePassword(password);
    storeEnteredBy(enteredBy);
    setAuthed(true);
  }

  return (
    <div className="gm-app">
      <div className="gm-header-bar">Gathering Moss Financial Center</div>
      <div className="gm-main">
        {authed ? (
          <TransactionEntryForm onAuthFailure={handleAuthFailure} />
        ) : (
          <PasswordGate onSubmit={handlePasswordSubmit} />
        )}
      </div>
    </div>
  );
}

export default App;
