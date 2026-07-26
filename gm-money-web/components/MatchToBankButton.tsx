"use client";

import { useState, useTransition } from "react";
import { matchToBank } from "@/app/register/actions";
import type { MatchCandidate } from "@/lib/register";

type Props = {
  manualId: string;
  accountId: string;
  candidate: MatchCandidate;
};

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

export function MatchToBankButton({ manualId, accountId, candidate }: Props) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm(
      `Match this to the bank transaction "${candidate.description}" (${formatMoney(candidate.amount)}, ${candidate.date})? ` +
        "This entry will be marked Cleared and the bank row will stay hidden as its duplicate.",
    );
    if (!confirmed) return;

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
      <button type="button" className="gm-link-button" disabled={isPending} onClick={handleClick}>
        {isPending ? "Matching..." : `Looks like "${candidate.description}" (${formatMoney(candidate.amount)}) — confirm & clear`}
      </button>
      {error && <span className="gm-error gm-error--inline">{error}</span>}
    </div>
  );
}
