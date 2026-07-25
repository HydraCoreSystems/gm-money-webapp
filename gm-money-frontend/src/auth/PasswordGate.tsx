import { useState, type FormEvent } from "react";

const PEOPLE = ["Phil", "Crystal"] as const;

type Props = { onSubmit: (password: string, enteredBy: string) => void };

export function PasswordGate({ onSubmit }: Props) {
  const [password, setPassword] = useState("");
  const [enteredBy, setEnteredBy] = useState<string>(PEOPLE[0]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password) onSubmit(password, enteredBy);
  }

  return (
    <main className="gm-login-shell">
      <section className="gm-login-story">
        <div className="gm-brand-mark gm-brand-mark--large">GM</div>
        <span className="gm-login-eyebrow">GATHERING MOSS FINANCIAL CENTER</span>
        <h1>Clarity for every dollar your business grows.</h1>
        <p>One connected place for cash flow, transactions, schedules, budgets, and practical financial guidance.</p>
        <ul>
          <li>Live business cash position</li>
          <li>Microsoft Money-style unified register</li>
          <li>Smart categorization and recurring planning</li>
        </ul>
      </section>
      <section className="gm-login-panel">
        <form className="gm-login-card" onSubmit={handleSubmit}>
          <span className="gm-login-eyebrow">SECURE WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p>Choose your name and enter the shared GM Money password.</p>
          <div className="gm-field">
            <label>Who are you?</label>
            <div className="gm-who-picker">
              {PEOPLE.map((person) => (
                <button type="button" key={person} className={enteredBy === person ? "gm-who-picker__selected" : ""} onClick={() => setEnteredBy(person)}>{person}</button>
              ))}
            </div>
          </div>
          <div className="gm-field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="gm-button">Enter financial center</button>
        </form>
      </section>
    </main>
  );
}
