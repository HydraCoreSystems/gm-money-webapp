"use client";

import { useState, useTransition } from "react";
import { CategoryPicker } from "./CategoryPicker";
import { createTransaction } from "@/app/entry/actions";
import type { CategoryGroupOption } from "@/lib/categories";

type Selection = { categoryId: string; subcategoryId: string | null; type: "income" | "expense" };

const PAYMENT_METHODS = ["Debit Card", "Credit Card", "Cash", "Check", "ACH", "Wire", "PayPal", "Venmo", "Shopify Payout", "Square", "Other"];

function todayLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function EntryForm({
  accounts,
  categoryGroups,
}: {
  accounts: { id: string; name: string }[];
  categoryGroups: CategoryGroupOption[];
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError("");
    setStatus("idle");
    const result = await createTransaction(formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus("success");
    setSelection(null);
  }

  return (
    <form
      action={(formData) => startTransition(() => handleSubmit(formData))}
      className="gm-card gm-card--wide"
      style={{ maxWidth: 900, margin: "0 auto" }}
    >
      <div className="gm-section-heading" style={{ padding: "26px 30px 0" }}>
        <div className="gm-section-icon" style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "var(--sage-tint)", color: "var(--forest)", fontWeight: 700 }}>
          $
        </div>
        <div>
          <h2>What happened?</h2>
          <p>The category you choose below decides Income or Expense automatically -- it's never a separate field.</p>
        </div>
      </div>

      <div style={{ padding: "0 30px 30px" }}>
        {error && <p className="gm-error">{error}</p>}
        {status === "success" && <p className="gm-success">Saved.</p>}

        <div className="gm-form-grid gm-form-grid--three">
          <div className="gm-field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" name="date" defaultValue={todayLocalDate()} required />
          </div>
          <div className="gm-field">
            <label htmlFor="accountId">Account</label>
            <select id="accountId" name="accountId" required defaultValue="">
              <option value="" disabled>
                Choose an account…
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="gm-field">
            <label htmlFor="amount">Amount</label>
            <input id="amount" type="number" name="amount" step="0.01" placeholder="-42.50 or 100.00" required />
          </div>
        </div>

        <CategoryPicker
          groups={categoryGroups}
          value={selection}
          onChange={setSelection}
          categoryFieldName="categoryId"
          subcategoryFieldName="subcategoryId"
        />
        <p className="gm-category-picker__hint" style={{ marginTop: -12, marginBottom: 16 }}>
          Amount's sign must match the category (negative for Expense, positive for Income).
        </p>

        <div className="gm-form-grid gm-form-grid--two">
          <div className="gm-field">
            <label htmlFor="payee">Payee</label>
            <input id="payee" type="text" name="payee" required />
          </div>
          <div className="gm-field">
            <label htmlFor="paymentMethod">Payment Method</label>
            <input id="paymentMethod" list="payment-methods" name="paymentMethod" />
            <datalist id="payment-methods">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="gm-field">
          <label htmlFor="notes">
            Notes <span style={{ textTransform: "none", fontWeight: 500, color: "var(--faint)" }}>(optional)</span>
          </label>
          <textarea id="notes" name="notes" rows={2} />
        </div>

        <div className="gm-panel-foot">
          <span>Will show as Uncleared until it matches the bank feed.</span>
          <button type="submit" className="gm-button gm-button--glow" disabled={isPending}>
            {isPending ? "Saving…" : "Save transaction"}
          </button>
        </div>
      </div>
    </form>
  );
}
