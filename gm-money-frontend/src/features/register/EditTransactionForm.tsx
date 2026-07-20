import { useState, type FormEvent } from "react";
import { callApi } from "../../api/client";
import type { FormOptions, RegisterEntry, UpdateTransactionResult } from "../../api/types";
import { TransactionFields } from "../transaction-entry/TransactionFields";

function initialType(formOptions: FormOptions, category: string): "Income" | "Expense" | "" {
  const group = formOptions.categoryGroups.find((g) => g.categories.some((c) => c.name === category));
  return group?.type ?? "";
}

type Props = {
  formOptions: FormOptions;
  entry: RegisterEntry;
  account: string;
  onAuthFailure: () => void;
  onSaved: () => void;
  onCancel: () => void;
};

export function EditTransactionForm({ formOptions, entry, account: currentAccount, onAuthFailure, onSaved, onCancel }: Props) {
  const [date, setDate] = useState(entry.date);
  const [account, setAccount] = useState(currentAccount);
  const [payee, setPayee] = useState(entry.payee);
  const [amountText, setAmountText] = useState(String(Math.abs(entry.amount)));
  const [category, setCategory] = useState(entry.category);
  const [subcategory, setSubcategory] = useState(entry.subcategory);
  const [type, setType] = useState<"Income" | "Expense" | "">(initialType(formOptions, entry.category));
  const [paymentMethod, setPaymentMethod] = useState(entry.paymentMethod);
  const [notes, setNotes] = useState(entry.notes);

  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError("");

    const result = await callApi<UpdateTransactionResult>("updateTransaction", {
      transactionId: entry.transactionId,
      date,
      account,
      payee,
      amount: Number(amountText),
      category,
      subcategory,
      paymentMethod,
      notes,
    });

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setError(result.fieldErrors?.join(" ") ?? result.error);
      setStatus("idle");
      return;
    }

    onSaved();
  }

  return (
    <div className="gm-card gm-edit-form">
      <h3 style={{ marginTop: 0 }}>Edit Transaction</h3>

      {error && <p className="gm-error">{error}</p>}

      <form onSubmit={handleSubmit}>
        <TransactionFields
          formOptions={formOptions}
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

        <div className="gm-edit-form__actions">
          <button type="button" className="gm-button gm-button--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="gm-button" disabled={status === "submitting"}>
            {status === "submitting" ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
