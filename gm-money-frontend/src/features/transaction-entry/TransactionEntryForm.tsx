import { useState, type FormEvent } from "react";
import { callApi, getStoredEnteredBy } from "../../api/client";
import type { CreateTransactionResult } from "../../api/types";
import { CategoryPicker } from "./CategoryPicker";
import { useFormOptions } from "./useFormOptions";

function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type Props = {
  onAuthFailure: () => void;
};

export function TransactionEntryForm({ onAuthFailure }: Props) {
  const { status, options, error: optionsError } = useFormOptions(onAuthFailure);

  const [date, setDate] = useState(todayLocalDate());
  const [account, setAccount] = useState("");
  const [payee, setPayee] = useState("");
  const [amountText, setAmountText] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [type, setType] = useState<"Income" | "Expense" | "">("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");

  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  if (status === "loading") {
    return (
      <div className="gm-card">
        <p>Loading form…</p>
      </div>
    );
  }

  if (status === "error" || !options) {
    return (
      <div className="gm-card">
        <p className="gm-error">{optionsError || "Could not load the form."}</p>
      </div>
    );
  }

  const preview =
    type && amountText
      ? `${type === "Income" ? "+" : "-"}$${Number(amountText || 0).toFixed(2)} (${type})`
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitStatus("submitting");
    setSubmitError("");

    const result = await callApi<CreateTransactionResult>("createTransaction", {
      date,
      account,
      payee,
      amount: Number(amountText),
      category,
      subcategory,
      paymentMethod,
      notes,
      enteredBy: getStoredEnteredBy(),
    });

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setSubmitError(result.fieldErrors?.join(" ") ?? result.error);
      setSubmitStatus("idle");
      return;
    }

    setSubmitStatus("success");
    setSuccessMessage(
      result.data.duplicate
        ? result.data.message ?? "Skipped a duplicate entry."
        : `Saved ${result.data.transactionId}.`
    );
    setPayee("");
    setAmountText("");
    setNotes("");
  }

  return (
    <div className="gm-card">
      <h2 style={{ marginTop: 0 }}>New Transaction</h2>

      {submitError && <p className="gm-error">{submitError}</p>}
      {submitStatus === "success" && <p className="gm-success">{successMessage}</p>}

      <form onSubmit={handleSubmit}>
        <div className="gm-field">
          <label htmlFor="date">Date</label>
          <input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div className="gm-field">
          <label htmlFor="account">Account</label>
          <select
            id="account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            required
          >
            <option value="" disabled>
              Choose an account…
            </option>
            {options.accounts.map((acc) => (
              <option key={acc} value={acc}>
                {acc}
              </option>
            ))}
          </select>
        </div>

        <div className="gm-field">
          <label htmlFor="payee">Payee</label>
          <input
            id="payee"
            type="text"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            required
          />
        </div>

        <div className="gm-field">
          <label htmlFor="amount">Amount</label>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
        </div>

        <CategoryPicker
          groups={options.categoryGroups}
          category={category}
          subcategory={subcategory}
          onChange={(next) => {
            setCategory(next.category);
            setSubcategory(next.subcategory);
            setType(next.type);
          }}
        />

        {preview && (
          <p className={`gm-preview gm-preview--${type === "Income" ? "income" : "expense"}`}>
            {preview}
          </p>
        )}

        <div className="gm-field">
          <label htmlFor="paymentMethod">Payment Method</label>
          <select
            id="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            required
          >
            <option value="" disabled>
              Choose a payment method…
            </option>
            {options.paymentMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>

        <div className="gm-field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <button type="submit" className="gm-button" disabled={submitStatus === "submitting"}>
          {submitStatus === "submitting" ? "Saving…" : "Save Transaction"}
        </button>
      </form>
    </div>
  );
}
