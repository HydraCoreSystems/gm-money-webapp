import { useId, useState, type FormEvent } from "react";
import { callApi } from "../../api/client";
import type { FormOptions, ScheduledTransaction } from "../../api/types";
import { CategoryPicker } from "../transaction-entry/CategoryPicker";

const FREQUENCIES = ["Weekly", "Every 2 Weeks", "Monthly", "Quarterly", "Yearly"];

function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialType(formOptions: FormOptions, category: string): "Income" | "Expense" | "" {
  const group = formOptions.categoryGroups.find((g) => g.categories.some((c) => c.name === category));
  return group?.type ?? "";
}

type Props = {
  formOptions: FormOptions;
  existing?: ScheduledTransaction;
  onAuthFailure: () => void;
  onSaved: () => void;
  onCancel?: () => void;
};

export function ScheduledTransactionForm({ formOptions, existing, onAuthFailure, onSaved, onCancel }: Props) {
  const uid = useId();
  const [payee, setPayee] = useState(existing?.payee ?? "");
  const [amountText, setAmountText] = useState(existing ? String(Math.abs(existing.amount)) : "");
  const [account, setAccount] = useState(existing?.account ?? formOptions.accounts[0] ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [subcategory, setSubcategory] = useState(existing?.subcategory ?? "");
  const [type, setType] = useState<"Income" | "Expense" | "">(
    existing ? initialType(formOptions, existing.category) : ""
  );
  const [paymentMethod, setPaymentMethod] = useState(existing?.paymentMethod ?? formOptions.paymentMethods[0] ?? "");
  const [frequency, setFrequency] = useState(existing?.frequency ?? "Monthly");
  const [nextDue, setNextDue] = useState(existing?.nextDue ?? todayLocalDate());
  const [active, setActive] = useState(existing?.active ?? true);
  const [autoCreate, setAutoCreate] = useState(existing?.autoCreate ?? true);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [runMode, setRunMode] = useState<"unlimited" | "limited">(existing?.occurrenceLimit ? "limited" : "unlimited");
  const [occurrenceLimit, setOccurrenceLimit] = useState(existing?.occurrenceLimit ? String(existing.occurrenceLimit) : "");

  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState("");

  const amount = Number(amountText);
  const showPreview = amountText.trim() !== "" && !Number.isNaN(amount) && type !== "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError("");

    const payload = {
      payee,
      amount,
      account,
      category,
      subcategory,
      paymentMethod,
      frequency,
      nextDue,
      active,
      autoCreate,
      notes,
      occurrenceLimit: runMode === "limited" ? Number(occurrenceLimit) : null,
    };

    const result = existing
      ? await callApi("updateScheduledTransaction", { ...payload, scheduleId: existing.scheduleId })
      : await callApi("createScheduledTransaction", payload);

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setError(result.fieldErrors?.join(" ") ?? result.error);
      setStatus("idle");
      return;
    }

    if (!existing) {
      setPayee("");
      setAmountText("");
      setNotes("");
    }
    setStatus("idle");
    onSaved();
  }

  return (
    <div className={existing ? "gm-card gm-edit-form" : "gm-card"}>
      <h3 style={{ marginTop: 0 }}>{existing ? "Edit Scheduled Transaction" : "Add Scheduled Transaction"}</h3>

      {error && <p className="gm-error">{error}</p>}

      <form onSubmit={handleSubmit}>
        <div className="gm-field">
          <label htmlFor={`${uid}-payee`}>Payee</label>
          <input
            id={`${uid}-payee`}
            type="text"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            required
          />
        </div>

        <div className="gm-field">
          <label htmlFor={`${uid}-amount`}>Amount</label>
          <input
            id={`${uid}-amount`}
            type="number"
            step="0.01"
            min="0"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            required
          />
        </div>

        {showPreview && (
          <p className={type === "Income" ? "gm-preview gm-preview--income" : "gm-preview gm-preview--expense"}>
            {type === "Income" ? "+" : "-"}${Math.abs(amount).toFixed(2)} ({type})
          </p>
        )}

        <div className="gm-field">
          <label htmlFor={`${uid}-account`}>Account</label>
          <select id={`${uid}-account`} value={account} onChange={(e) => setAccount(e.target.value)} required>
            {formOptions.accounts.map((acc) => (
              <option key={acc} value={acc}>
                {acc}
              </option>
            ))}
          </select>
        </div>

        <CategoryPicker
          groups={formOptions.categoryGroups}
          category={category}
          subcategory={subcategory}
          onChange={(next) => {
            setCategory(next.category);
            setSubcategory(next.subcategory);
            setType(next.type);
          }}
        />

        <div className="gm-field">
          <label htmlFor={`${uid}-payment-method`}>Payment Method</label>
          <select
            id={`${uid}-payment-method`}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            required
          >
            {formOptions.paymentMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>

        <div className="gm-field">
          <label htmlFor={`${uid}-frequency`}>Frequency</label>
          <select id={`${uid}-frequency`} value={frequency} onChange={(e) => setFrequency(e.target.value)} required>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div className="gm-field">
          <label htmlFor={`${uid}-next-due`}>Next Due</label>
          <input
            id={`${uid}-next-due`}
            type="date"
            value={nextDue}
            onChange={(e) => setNextDue(e.target.value)}
            required
          />
        </div>

        <fieldset className="gm-schedule-runs">
          <legend>How long should this run?</legend>
          <div className="gm-segmented-control">
            <button type="button" className={runMode === "unlimited" ? "is-active" : ""} onClick={() => setRunMode("unlimited")}>Until I stop it</button>
            <button type="button" className={runMode === "limited" ? "is-active" : ""} onClick={() => setRunMode("limited")}>A set number of times</button>
          </div>
          {runMode === "limited" && (
            <div className="gm-field gm-field--inline">
              <label htmlFor={`${uid}-occurrence-limit`}>Total transactions</label>
              <input id={`${uid}-occurrence-limit`} type="number" min={Math.max(1, (existing?.occurrencesGenerated ?? 0) + 1)} step="1" value={occurrenceLimit} onChange={(e) => setOccurrenceLimit(e.target.value)} required />
              {existing && existing.occurrencesGenerated > 0 && <small>{existing.occurrencesGenerated} already completed</small>}
            </div>
          )}
        </fieldset>

        <div className="gm-who-picker">
          <button
            type="button"
            className={active ? "gm-who-picker__selected" : ""}
            onClick={() => setActive(!active)}
          >
            {active ? "Active ✓" : "Inactive"}
          </button>
          <button
            type="button"
            className={autoCreate ? "gm-who-picker__selected" : ""}
            onClick={() => setAutoCreate(!autoCreate)}
          >
            {autoCreate ? "Auto Create ✓" : "Manual Only"}
          </button>
        </div>

        <div className="gm-field">
          <label htmlFor={`${uid}-notes`}>Notes</label>
          <textarea id={`${uid}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {existing ? (
          <div className="gm-edit-form__actions">
            <button type="button" className="gm-button gm-button--secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="gm-button" disabled={status === "submitting"}>
              {status === "submitting" ? "Saving…" : "Save Changes"}
            </button>
          </div>
        ) : (
          <button type="submit" className="gm-button" disabled={status === "submitting"}>
            {status === "submitting" ? "Saving…" : "Add Scheduled Transaction"}
          </button>
        )}
      </form>
    </div>
  );
}
