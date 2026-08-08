"use client";

import { useState, useTransition } from "react";
import { CategoryPicker } from "./CategoryPicker";
import { MatchToBankButton } from "./MatchToBankButton";
import { deleteManualTransaction, updateManualTransaction } from "@/app/register/actions";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";
import type { RegisterEntry } from "@/lib/register";
import type { CategoryGroupOption } from "@/lib/categories";

type Selection = { categoryId: string; subcategoryId: string | null; type: "income" | "expense" };

function formatMoneySigned(amount: number): string {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function statusBadgeClass(status: string): string {
  if (status === "cleared") return "gm-status-badge gm-status-badge--cleared";
  if (status === "uncleared") return "gm-status-badge gm-status-badge--uncleared";
  return "gm-status-badge gm-status-badge--reconciled";
}

// A stored leaf category id is either a top-level category row directly,
// or a subcategory row -- resolve it back into the {categoryId,
// subcategoryId} shape CategoryPicker expects, the reverse of what
// CategoryPicker's own "selected" lookup does for display.
function resolveSelection(leafCategoryId: string | null, groups: CategoryGroupOption[]): Selection | null {
  if (!leafCategoryId) return null;
  for (const group of groups) {
    for (const cat of group.categories) {
      if (cat.id === leafCategoryId) return { categoryId: cat.id, subcategoryId: null, type: group.type };
      const sub = cat.subcategories.find((s) => s.id === leafCategoryId);
      if (sub) return { categoryId: cat.id, subcategoryId: sub.id, type: group.type };
    }
  }
  return null;
}

// No auto sign-correction here: the category's type classifies a
// transaction for totals/charts, it does not force the sign. A refund on
// an expense category is positive and that's exactly what's stored.

export function RegisterEntryRow({
  entry,
  accountId,
  categoryGroups,
}: {
  entry: RegisterEntry;
  accountId: string;
  categoryGroups: CategoryGroupOption[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [date, setDate] = useState(entry.date);
  const [payee, setPayee] = useState(entry.description);
  const [amount, setAmount] = useState(String(entry.amount));
  const [selection, setSelection] = useState<Selection | null>(resolveSelection(entry.categoryId, categoryGroups));
  const [paymentMethod, setPaymentMethod] = useState(entry.paymentMethod ?? "Debit Card");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isPending, startTransition] = useTransition();

  function startEditing() {
    setDate(entry.date);
    setPayee(entry.description);
    setAmount(String(entry.amount));
    setSelection(resolveSelection(entry.categoryId, categoryGroups));
    setPaymentMethod(entry.paymentMethod ?? "Debit Card");
    setNotes(entry.notes ?? "");
    setError("");
    setIsEditing(true);
  }

  function handleSelectionChange(sel: Selection | null) {
    setSelection(sel);
  }

  function handleSave() {
    setError("");
    const formData = new FormData();
    formData.set("id", entry.id);
    formData.set("accountId", accountId);
    formData.set("date", date);
    formData.set("payee", payee);
    formData.set("amount", amount);
    formData.set("categoryId", selection?.categoryId ?? "");
    formData.set("subcategoryId", selection?.subcategoryId ?? "");
    formData.set("paymentMethod", paymentMethod);
    formData.set("notes", notes);

    startTransition(async () => {
      const result = await updateManualTransaction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
    });
  }

  function handleDelete() {
    const confirmed = window.confirm(`Delete the manual entry "${entry.description}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeleteError("");
    const formData = new FormData();
    formData.set("id", entry.id);
    formData.set("accountId", accountId);

    startTransition(async () => {
      const result = await deleteManualTransaction(formData);
      if (!result.ok) setDeleteError(result.error);
    });
  }

  if (isEditing) {
    return (
      <div className="gm-register-row">
        <div className="gm-register-row__edit">
          <div className="gm-form-grid gm-form-grid--three">
            <div className="gm-field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="gm-field">
              <label>Payee</label>
              <input type="text" value={payee} onChange={(e) => setPayee(e.target.value)} required />
            </div>
            <div className="gm-field">
              <label>Amount</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <CategoryPicker
            groups={categoryGroups}
            value={selection}
            onChange={handleSelectionChange}
            categoryFieldName={`categoryId-${entry.id}`}
            subcategoryFieldName={`subcategoryId-${entry.id}`}
          />

          <div className="gm-form-grid gm-form-grid--two" style={{ marginTop: 12 }}>
            <div className="gm-field">
              <label>Payment Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="gm-field">
              <label>Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {error && <p className="gm-error gm-register-row__error">{error}</p>}

          <div className="gm-register-row__match-actions">
            <button type="button" className="gm-button" disabled={isPending} onClick={handleSave}>
              {isPending ? "Saving..." : "Save changes"}
            </button>
            <button type="button" className="gm-link-button" disabled={isPending} onClick={() => setIsEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gm-register-row">
      <div className="gm-register-row__top">
        <div className="gm-register-row__main">
          <div className="gm-register-row__payee">{entry.description}</div>
          <div className="gm-register-row__meta">
            {entry.date}
            {entry.category ? ` · ${entry.category}` : " · Uncategorized"}
          </div>
        </div>
        <div className="gm-register-row__amounts">
          <div className={entry.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"}>
            {formatMoneySigned(entry.amount)}
          </div>
          <div className="gm-register-row__balance">{formatMoney(entry.runningBalance)}</div>
        </div>
      </div>
      <div className="gm-register-row__actions">
        <span className={statusBadgeClass(entry.status)}>{entry.status}</span>
        {entry.source === "sheet_manual" && (
          <>
            <button type="button" className="gm-link-button" disabled={isPending} onClick={startEditing}>
              Edit
            </button>
            <button type="button" className="gm-link-button gm-link-button--danger" disabled={isPending} onClick={handleDelete}>
              {isPending ? "Deleting..." : "Delete"}
            </button>
            {deleteError && <span className="gm-error gm-error--inline">{deleteError}</span>}
          </>
        )}
      </div>
      {entry.matchCandidate && <MatchToBankButton manualId={entry.id} accountId={accountId} candidate={entry.matchCandidate} />}
    </div>
  );
}
