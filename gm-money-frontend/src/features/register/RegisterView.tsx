import { useCallback, useEffect, useState } from "react";
import { callApi } from "../../api/client";
import type { FormOptions, RegisterData, RegisterStatus } from "../../api/types";
import { RegisterEntryRow } from "./RegisterEntryRow";

const STATUS_OPTIONS: ("All" | RegisterStatus)[] = ["All", "Uncleared", "Cleared", "Reconciled"];

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

type Props = {
  formOptions: FormOptions;
  onAuthFailure: () => void;
};

export function RegisterView({ formOptions, onAuthFailure }: Props) {
  const [account, setAccount] = useState(formOptions.accounts[0] ?? "");
  const [status, setStatus] = useState<"All" | RegisterStatus>("All");
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [data, setData] = useState<RegisterData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!account) return;
    setLoadStatus("loading");

    const result = await callApi<RegisterData>("getRegister", { account, status });

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setError(result.error);
      setLoadStatus("error");
      return;
    }

    setData(result.data);
    setLoadStatus("ready");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, status]);

  useEffect(() => {
    load();
  }, [load]);

  const manualUnclearedEntries = (data?.entries ?? []).filter(
    (e) => e.source === "Manual" && e.status === "Uncleared"
  );

  return (
    <div className="gm-card gm-card--wide">
      <h2 style={{ marginTop: 0 }}>Register</h2>

      <div className="gm-field">
        <label htmlFor="register-account">Account</label>
        <select id="register-account" value={account} onChange={(e) => setAccount(e.target.value)}>
          {formOptions.accounts.map((acc) => (
            <option key={acc} value={acc}>
              {acc}
            </option>
          ))}
        </select>
      </div>

      <div className="gm-field">
        <label htmlFor="register-status">Status</label>
        <select
          id="register-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "All" | RegisterStatus)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loadStatus === "loading" && <p>Loading register… this can take a bit for accounts with a lot of history.</p>}
      {loadStatus === "error" && <p className="gm-error">{error}</p>}

      {loadStatus === "ready" && data && (
        <>
          <div className="gm-register-summary">
            <div>
              <div className="gm-register-summary__label">Bank Balance</div>
              <div className="gm-register-summary__value">{formatMoney(data.bankBalance)}</div>
            </div>
            <div>
              <div className="gm-register-summary__label">Projected Balance</div>
              <div className="gm-register-summary__value">{formatMoney(data.projectedBalance)}</div>
            </div>
          </div>

          {data.truncated && (
            <p className="gm-register-note">
              Showing the most recent {data.entries.length} of {data.totalCount} transactions.
            </p>
          )}

          {data.entries.length === 0 ? (
            <p>No transactions match.</p>
          ) : (
            <div className="gm-register-list">
              {data.entries.map((entry, index) => (
                <RegisterEntryRow
                  key={entry.transactionId || `${entry.date}-${entry.payee}-${index}`}
                  entry={entry}
                  account={account}
                  formOptions={formOptions}
                  manualUnclearedEntries={manualUnclearedEntries}
                  onAuthFailure={onAuthFailure}
                  onChanged={load}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
