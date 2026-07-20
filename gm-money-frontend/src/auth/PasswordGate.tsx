import { useState, type FormEvent } from "react";

const PEOPLE = ["Phil", "Crystal"] as const;

type Props = {
  onSubmit: (password: string, enteredBy: string) => void;
};

export function PasswordGate({ onSubmit }: Props) {
  const [password, setPassword] = useState("");
  const [enteredBy, setEnteredBy] = useState<string>(PEOPLE[0]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    onSubmit(password, enteredBy);
  }

  return (
    <div className="gm-card">
      <form onSubmit={handleSubmit}>
        <div className="gm-field">
          <label>Who are you?</label>
          <div className="gm-who-picker">
            {PEOPLE.map((person) => (
              <button
                type="button"
                key={person}
                className={enteredBy === person ? "gm-who-picker__selected" : ""}
                onClick={() => setEnteredBy(person)}
              >
                {person}
              </button>
            ))}
          </div>
        </div>

        <div className="gm-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="gm-button">
          Continue
        </button>
      </form>
    </div>
  );
}
