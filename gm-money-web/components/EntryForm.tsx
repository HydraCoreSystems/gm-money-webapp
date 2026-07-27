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
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createRecurring, setCreateRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState("Monthly");
  const [recurringNextDue, setRecurringNextDue] = useState(todayLocalDate());
  const [recurringLimit, setRecurringLimit] = useState("");
  const [recurringAutoCreate, setRecurringAutoCreate] = useState(true);
  const [isPending, startTransition] = useTransition();

  // The server already rejects a sign/category mismatch outright (see
  // createTransaction's validation) -- this just does that correction
  // proactively so the user never has to notice and manually flip a
  // sign themselves. Applied at two discrete moments (category change,
  // amount blur) rather than on every keystroke, so it can't fight an
  // in-progress amount while someone's still typing it.
  function signCorrected(raw: string, type: "income" | "expense" | undefined | null): string {
    const trimmed = raw.trim();
    if (!trimmed || !type) return raw;
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num === 0) return raw;
    const corrected = type === "income" ? Math.abs(num) : -Math.abs(num);
    return corrected === num ? raw : String(corrected);
  }

  function handleSelectionChange(sel: Selection | null) {
    setSelection(sel);
    setAmount((prev) => signCorrected(prev, sel?.type));
  }

  function handleAmountBlur() {
    setAmount((prev) => signCorrected(prev, selection?.type));
  }

  async function handleSubmit(formData: FormData) {
    setError("");
    setNotice("");
    setStatus("idle");
    formData.set("createRecurring", createRecurring ? "true" : "false");
    formData.set("recurringFrequency", recurringFrequency);
    formData.set("recurringNextDue", recurringNextDue);
    formData.set("recurringLimit", recurringLimit);
    formData.set("recurringAutoCreate", recurringAutoCreate ? "true" : "false");
    const result = await createTransaction(formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus("success");
    setSelection(null);
    setAmount("");
    if (createRecurring) {
      if (result.recurringCreated) {
        setNotice("Recurring schedule was also created.");
      } else if (result.recurringError) {
        setNotice(`Transaction saved, but recurring setup failed: ${result.recurringError}`);
      }
      setCreateRecurring(false);
      setRecurringLimit("");
      setRecurringAutoCreate(true);
      setRecurringFrequency("Monthly");
      setRecurringNextDue(todayLocalDate());
    }
  }

  return (
    <form
      action={(formData) => startTransition(() => handleSubmit(formData))}
      className="gm-card gm-card--wide"
      style={{ maxWidth: 900, margin: "0 auto" }}
    >
      <div style={{ padding: "26px 30px 30px" }}>
        {error && <p className="gm-error">{error}</p>}
        {status === "success" && <p className="gm-success">Saved.</p>}
        {notice && <p className="gm-register-note" style={{ marginTop: 0 }}>{notice}</p>}

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
            <input
              id="amount"
              type="number"
              name="amount"
              step="0.01"
              placeholder="42.50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={handleAmountBlur}
              required
            />
          </div>
        </div>

        <CategoryPicker
          groups={categoryGroups}
          value={selection}
          onChange={handleSelectionChange}
          categoryFieldName="categoryId"
          subcategoryFieldName="subcategoryId"
          allowCreate
        />
        <p className="gm-category-picker__hint" style={{ marginTop: -12, marginBottom: 16 }}>
          Expense amounts are entered as negative, Income as positive -- picking a category sets this automatically.
        </p>

        <div className="gm-form-grid gm-form-grid--two">
          <div className="gm-field">
            <label htmlFor="payee">Payee</label>
            <input id="payee" type="text" name="payee" required />
          </div>
          <div className="gm-field">
            <label htmlFor="paymentMethod">Payment Method</label>
            <select id="paymentMethod" name="paymentMethod" defaultValue="Debit Card">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="gm-field">
          <label htmlFor="notes">
            Notes <span style={{ textTransform: "none", fontWeight: 500, color: "var(--faint)" }}>(optional)</span>
          </label>
          <textarea id="notes" name="notes" rows={2} />
        </div>

        <div className="gm-card" style={{ marginTop: 10, padding: "12px 14px", border: "1px solid var(--line)" }}>
          <div className="gm-who-picker" style={{ marginTop: 0 }}>
            <button
              type="button"
              className={createRecurring ? "gm-who-picker__selected" : ""}
              onClick={() => setCreateRecurring((prev) => !prev)}
            >
              {createRecurring ? "Also make recurring ✓" : "Make this recurring"}
            </button>
            <button
              type="button"
              className={recurringAutoCreate ? "gm-who-picker__selected" : ""}
              onClick={() => setRecurringAutoCreate((prev) => !prev)}
              disabled={!createRecurring}
            >
              {recurringAutoCreate ? "Auto post ✓" : "Manual schedule"}
            </button>
          </div>

          {createRecurring && (
            <div className="gm-form-grid gm-form-grid--three" style={{ marginTop: 10 }}>
              <div className="gm-field">
                <label>Recurring frequency</label>
                <select value={recurringFrequency} onChange={(e) => setRecurringFrequency(e.target.value)}>
                  <option>Daily</option>
                  <option>Weekly</option>
                  <option>Every 2 Weeks</option>
                  <option>Monthly</option>
                  <option>Quarterly</option>
                  <option>Yearly</option>
                </select>
              </div>
              <div className="gm-field">
                <label>First due date</label>
                <input type="date" value={recurringNextDue} onChange={(e) => setRecurringNextDue(e.target.value)} />
              </div>
              <div className="gm-field">
                <label>Number of payments</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={recurringLimit}
                  onChange={(e) => setRecurringLimit(e.target.value)}
                  placeholder="Blank = ongoing"
                />
              </div>
            </div>
          )}
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
