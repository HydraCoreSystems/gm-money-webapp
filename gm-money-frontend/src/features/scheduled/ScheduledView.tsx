import { useCallback, useEffect, useState } from "react";
import { callApi } from "../../api/client";
import type { FormOptions, ScheduledTransaction } from "../../api/types";
import { ScheduledTransactionForm } from "./ScheduledTransactionForm";
import { BillCalendar } from "./BillCalendar";
import { Avatar } from "../shared/Avatar";

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

type Props = {
  formOptions: FormOptions;
  onAuthFailure: () => void;
};

export function ScheduledView({ formOptions, onAuthFailure }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<ScheduledTransaction[]>([]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [processMessage, setProcessMessage] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    const result = await callApi<ScheduledTransaction[]>("getScheduledTransactions");

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setError(result.error);
      setStatus("error");
      return;
    }

    setItems(result.data);
    setStatus("ready");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(scheduleId: string, payee: string) {
    if (!window.confirm(`Delete scheduled transaction "${payee}"?`)) return;
    setBusy(true);
    setError("");
    const result = await callApi("deleteScheduledTransaction", { scheduleId });
    setBusy(false);

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setError(result.error);
      return;
    }

    await load();
  }

  async function handleProcessNow() {
    setBusy(true);
    setError("");
    setProcessMessage("");
    const result = await callApi("processScheduledTransactionsNow");
    setBusy(false);

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setError(result.error);
      return;
    }

    setProcessMessage("Processed any due scheduled transactions.");
    await load();
  }

  return (
    <div className="gm-card gm-card--wide">
      <h2 style={{ marginTop: 0 }}>Scheduled Transactions</h2>

      {error && <p className="gm-error">{error}</p>}
      {processMessage && <p className="gm-success">{processMessage}</p>}

      <button type="button" className="gm-button gm-button--secondary" disabled={busy} onClick={handleProcessNow}>
        Process Due Now
      </button>

      {status === "ready" && (
        <div style={{ marginTop: "1.25rem" }}>
          <BillCalendar items={items} />
        </div>
      )}

      <div style={{ marginTop: "1.25rem" }}>
        <ScheduledTransactionForm formOptions={formOptions} onAuthFailure={onAuthFailure} onSaved={load} />
      </div>

      <h3 style={{ marginTop: "1.5rem" }}>Existing Schedules</h3>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p className="gm-error">{error}</p>}

      {status === "ready" && items.length === 0 && <p>No scheduled transactions yet.</p>}

      {status === "ready" && items.length > 0 && (
        <div className="gm-register-list">
          {items.map((item) =>
            editingId === item.scheduleId ? (
              <ScheduledTransactionForm
                key={item.scheduleId}
                formOptions={formOptions}
                existing={item}
                onAuthFailure={onAuthFailure}
                onSaved={() => {
                  setEditingId(null);
                  load();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={item.scheduleId} className="gm-register-row">
                <div className="gm-register-row__top">
                  <Avatar label={item.payee} />
                  <div className="gm-register-row__main">
                    <div className="gm-register-row__payee">{item.payee}</div>
                    <div className="gm-register-row__meta">
                      {item.category}
                      {item.subcategory ? ` › ${item.subcategory}` : ""} · {item.frequency} · Next:{" "}
                      {item.nextDue}
                    </div>
                    <div className="gm-register-row__meta">
                      {item.account} · {item.paymentMethod}
                      {!item.active ? " · Inactive" : ""}
                      {!item.autoCreate ? " · Manual Only" : ""}
                    </div>
                    <div className="gm-schedule-progress">
                      <span>{item.occurrenceLimit === null ? "Runs until stopped" : item.completed ? "Completed" : `${item.remainingOccurrences} of ${item.occurrenceLimit} remaining`}</span>
                      {item.occurrenceLimit !== null && <div className="gm-progress-track"><i style={{ width: `${Math.min(100, (item.occurrencesGenerated / item.occurrenceLimit) * 100)}%` }} /></div>}
                    </div>
                  </div>
                  <div className="gm-register-row__amounts">
                    <div className={item.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"}>
                      {formatMoney(item.amount)}
                    </div>
                  </div>
                </div>
                <div className="gm-register-row__actions">
                  <button
                    type="button"
                    className="gm-link-button"
                    disabled={busy}
                    onClick={() => setEditingId(item.scheduleId)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="gm-link-button"
                    disabled={busy}
                    onClick={() => handleDelete(item.scheduleId, item.payee)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
