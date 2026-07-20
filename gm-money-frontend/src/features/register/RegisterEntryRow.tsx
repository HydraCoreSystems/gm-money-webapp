import { useState } from "react";
import { callApi } from "../../api/client";
import type {
  DeleteTransactionResult,
  FormOptions,
  MatchTransactionResult,
  RegisterEntry,
  RegisterStatus,
  UpdateTransactionStatusResult,
} from "../../api/types";
import { EditTransactionForm } from "./EditTransactionForm";

const STATUS_OPTIONS: RegisterStatus[] = ["Uncleared", "Cleared", "Reconciled"];

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function statusClass(status: string): string {
  switch (status) {
    case "Uncleared":
      return "gm-status-badge gm-status-badge--uncleared";
    case "Cleared":
      return "gm-status-badge gm-status-badge--cleared";
    case "Reconciled":
      return "gm-status-badge gm-status-badge--reconciled";
    default:
      return "gm-status-badge";
  }
}

type Props = {
  entry: RegisterEntry;
  account: string;
  formOptions: FormOptions;
  manualUnclearedEntries: RegisterEntry[];
  onAuthFailure: () => void;
  onChanged: () => void;
};

export function RegisterEntryRow({
  entry,
  account,
  formOptions,
  manualUnclearedEntries,
  onAuthFailure,
  onChanged,
}: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "match">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [matchTarget, setMatchTarget] = useState("");

  const isManual = entry.source === "Manual" && !!entry.transactionId;

  async function handleDelete() {
    if (!window.confirm(`Delete "${entry.payee}" (${formatMoney(entry.amount)})? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError("");
    const result = await callApi<DeleteTransactionResult>("deleteTransaction", {
      transactionId: entry.transactionId,
    });
    setBusy(false);
    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") return onAuthFailure();
      setError(result.error);
      return;
    }
    onChanged();
  }

  async function handleStatusChange(newStatus: RegisterStatus) {
    setBusy(true);
    setError("");
    const result = await callApi<UpdateTransactionStatusResult>("updateTransactionStatus", {
      transactionId: entry.transactionId,
      status: newStatus,
    });
    setBusy(false);
    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") return onAuthFailure();
      setError(result.error);
      return;
    }
    onChanged();
  }

  async function handleMatch() {
    if (!matchTarget) return;
    setBusy(true);
    setError("");
    const result = await callApi<MatchTransactionResult>("matchTransaction", {
      transactionId: matchTarget,
      bankDate: entry.date,
      bankDescription: entry.payee,
      bankAmount: entry.amount,
      bankAccount: account,
    });
    setBusy(false);
    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") return onAuthFailure();
      setError(result.error);
      return;
    }
    onChanged();
  }

  if (mode === "edit") {
    return (
      <EditTransactionForm
        formOptions={formOptions}
        entry={entry}
        account={account}
        onAuthFailure={onAuthFailure}
        onSaved={() => {
          setMode("view");
          onChanged();
        }}
        onCancel={() => setMode("view")}
      />
    );
  }

  return (
    <div className="gm-register-row">
      <div className="gm-register-row__top">
        <div className="gm-register-row__main">
          <div className="gm-register-row__payee">{entry.payee}</div>
          <div className="gm-register-row__meta">
            {entry.date} · {entry.category}
            {entry.subcategory ? ` → ${entry.subcategory}` : ""}
          </div>
        </div>
        <div className="gm-register-row__amounts">
          <div className={entry.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"}>
            {formatMoney(entry.amount)}
          </div>
          <div className="gm-register-row__balance">{formatMoney(entry.runningBalance)}</div>
        </div>
        <span className={statusClass(entry.status)}>{entry.status}</span>
      </div>

      {error && <p className="gm-error gm-register-row__error">{error}</p>}

      {isManual && (
        <div className="gm-register-row__actions">
          <button type="button" className="gm-link-button" disabled={busy} onClick={() => setMode("edit")}>
            Edit
          </button>
          <button type="button" className="gm-link-button" disabled={busy} onClick={handleDelete}>
            Delete
          </button>
          <select
            value={entry.status}
            disabled={busy}
            onChange={(e) => handleStatusChange(e.target.value as RegisterStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {entry.source === "Bank" && (
        <div className="gm-register-row__actions">
          {mode === "match" ? (
            <>
              <select value={matchTarget} onChange={(e) => setMatchTarget(e.target.value)} disabled={busy}>
                <option value="">Link to existing transaction…</option>
                {manualUnclearedEntries.map((m) => (
                  <option key={m.transactionId} value={m.transactionId}>
                    {m.date} · {m.payee} · {formatMoney(m.amount)}
                  </option>
                ))}
              </select>
              <button type="button" className="gm-link-button" disabled={busy || !matchTarget} onClick={handleMatch}>
                Link
              </button>
              <button type="button" className="gm-link-button" disabled={busy} onClick={() => setMode("view")}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="gm-link-button" disabled={busy} onClick={() => setMode("match")}>
              Link to existing transaction
            </button>
          )}
        </div>
      )}
    </div>
  );
}
