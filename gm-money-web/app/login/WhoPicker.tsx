"use client";

import { useState } from "react";

const PEOPLE = ["Phil", "Crystal"];

export function WhoPicker({ defaultValue }: { defaultValue?: string }) {
  const [selected, setSelected] = useState(defaultValue || PEOPLE[0]);

  return (
    <div className="gm-field">
      <label>Who are you?</label>
      <div className="gm-who-picker">
        {PEOPLE.map((person) => (
          <button
            key={person}
            type="button"
            className={selected === person ? "gm-who-picker__selected" : undefined}
            onClick={() => setSelected(person)}
          >
            {person}
          </button>
        ))}
      </div>
      <input type="hidden" name="enteredBy" value={selected} />
    </div>
  );
}
