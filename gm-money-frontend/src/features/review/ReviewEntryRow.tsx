import { useState } from "react";
import { callApi } from "../../api/client";
import type { ApproveTransactionResult, FormOptions, ReviewTransaction } from "../../api/types";
import { CategoryPicker } from "../transaction-entry/CategoryPicker";

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

type Props = {
  transaction: ReviewTransaction;
  formOptions: FormOptions;
  onAuthFailure: () => void;
  onApproved: (sourceRow: number) => void;
};

export function ReviewEntryRow({ transaction, formOptions, onAuthFailure, onApproved }: Props) {
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState("");

  async function handleApprove() {
    if (!category) {
      setError("Choose a category.");
      return;
    }

    setStatus("submitting");
    setError("");

    const result = await callApi<ApproveTransactionResult>("approveTransaction", {
      sourceRow: transaction.sourceRow,
      category,
      subcategory,
      notes,
    });

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") return onAuthFailure();
      setError(result.fieldErrors?.join(" ") ?? result.error);
      setStatus("idle");
      return;
    }

    onApproved(transaction.sourceRow);
  }

  return (
    <div className="gm-register-row">
      <div className="gm-register-row__top">
        <div className="gm-register-row__main">
          <div className="gm-register-row__payee">{transaction.description}</div>
          <div className="gm-register-row__meta">
            {transaction.date} · {transaction.account}
          </div>
        </div>
        <div className="gm-register-row__amounts">
          <div
            className={
              transaction.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"
            }
          >
            {formatMoney(transaction.amount)}
          </div>
        </div>
      </div>

      {error && <p className="gm-error gm-register-row__error">{error}</p>}

      <CategoryPicker
        groups={formOptions.categoryGroups}
        category={category}
        subcategory={subcategory}
        onChange={(next) => {
          setCategory(next.category);
          setSubcategory(next.subcategory);
        }}
      />

      <div className="gm-field">
        <label htmlFor={`review-notes-${transaction.sourceRow}`}>Notes</label>
        <textarea
          id={`review-notes-${transaction.sourceRow}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <button type="button" className="gm-button" disabled={status === "submitting"} onClick={handleApprove}>
        {status === "submitting" ? "Approving…" : "Approve"}
      </button>
    </div>
  );
}
