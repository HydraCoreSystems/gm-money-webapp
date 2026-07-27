"use client";

import { useState, useTransition } from "react";
import { matchToBank } from "@/app/register/actions";
import type { MatchCandidate } from "@/lib/register";

type Props = {
  manualId: string;
  accountId: string;
  candidate: MatchCandidate;
};

function formatMoneySigned(amount: number): string {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

// Renders the actual suspected-duplicate bank row -- not just a sentence
// describing it -- so confirming a match means comparing two real rows,
// not trusting a text description of one you can't see. The amount here
// is never added to the running balance above; it's a read-only preview
// of the bank row still hidden from the real ledger until confirmed.
export function MatchToBankButton({ manualId, accountId, candidate }: Props) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError("");
    const formData = new FormData();
    formData.set("manualId", manualId);
    formData.set("bankId", candidate.bankTransactionId);
    formData.set("accountId", accountId);

    startTransition(async () => {
      const result = await matchToBank(formData);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="gm-register-row__match">
      <div className="gm-register-row__match-label">Possible match for the entry above -- not yet counted in your balance</div>
      <div className="gm-register-row__match-preview">
        <div className="gm-register-row__match-main">
          <div className="gm-register-row__payee">{candidate.description}</div>
          <div className="gm-register-row__meta">{candidate.date} · from your bank feed</div>
        </div>
        <div
          className={
            candidate.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"
          }
        >
          {formatMoneySigned(candidate.amount)}
        </div>
      </div>
      <div className="gm-register-row__match-actions">
        <button type="button" className="gm-button gm-button--secondary" disabled={isPending} onClick={handleClick}>
          {isPending ? "Confirming..." : `Yes, same ${candidate.amount < 0 ? "purchase" : "deposit"} -- confirm & clear`}
        </button>
        {error && <span className="gm-error gm-error--inline">{error}</span>}
      </div>
    </div>
  );
}
