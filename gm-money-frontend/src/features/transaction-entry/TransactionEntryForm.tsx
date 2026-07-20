import { useState, type FormEvent } from "react";
import { callApi, getStoredEnteredBy } from "../../api/client";
import type { CreateTransactionResult, FormOptions } from "../../api/types";
import { TransactionFields } from "./TransactionFields";

function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type Props = {
  formOptions: FormOptions;
  onAuthFailure: () => void;
};

export function TransactionEntryForm({ formOptions: options, onAuthFailure }: Props) {
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
        <TransactionFields
          formOptions={options}
          date={date}
          onDateChange={setDate}
          account={account}
          onAccountChange={setAccount}
          payee={payee}
          onPayeeChange={setPayee}
          amountText={amountText}
          onAmountChange={setAmountText}
          category={category}
          subcategory={subcategory}
          type={type}
          onCategoryChange={(next) => {
            setCategory(next.category);
            setSubcategory(next.subcategory);
            setType(next.type);
          }}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          notes={notes}
          onNotesChange={setNotes}
        />

        <button type="submit" className="gm-button" disabled={submitStatus === "submitting"}>
          {submitStatus === "submitting" ? "Saving…" : "Save Transaction"}
        </button>
      </form>
    </div>
  );
}
