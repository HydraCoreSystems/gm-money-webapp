"use client";

import { useState, useTransition } from "react";
import { deleteManualTransaction } from "@/app/register/actions";

type Props = {
  id: string;
  accountId: string;
  description: string;
};

export function DeleteRegisterEntryButton({ id, accountId, description }: Props) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const confirmed = window.confirm(`Delete the manual entry "${description}"? This cannot be undone.`);
    if (!confirmed) return;

    setError("");
    const formData = new FormData();
    formData.set("id", id);
    formData.set("accountId", accountId);

    startTransition(async () => {
      const result = await deleteManualTransaction(formData);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button type="button" className="gm-link-button gm-link-button--danger" disabled={isPending} onClick={handleClick}>
        {isPending ? "Deleting..." : "Delete"}
      </button>
      {error && <span className="gm-error gm-error--inline">{error}</span>}
    </>
  );
}
