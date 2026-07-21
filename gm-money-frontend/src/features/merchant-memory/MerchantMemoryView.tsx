import { useCallback, useEffect, useState } from "react";
import { callApi } from "../../api/client";
import type { FormOptions, MerchantMemoryData, MerchantMemoryStatus } from "../../api/types";
import { EditMerchantMemoryForm } from "./EditMerchantMemoryForm";

const FILTER_OPTIONS: ("All" | "Auto-Ready" | "Learning" | "Locked")[] = [
  "All",
  "Auto-Ready",
  "Learning",
  "Locked",
];

function statusClass(status: MerchantMemoryStatus): string {
  switch (status) {
    case "Auto-Ready":
      return "gm-status-badge gm-status-badge--auto-ready";
    case "Locked":
      return "gm-status-badge gm-status-badge--locked";
    default:
      return "gm-status-badge gm-status-badge--learning";
  }
}

type Props = {
  formOptions: FormOptions;
  onAuthFailure: () => void;
};

export function MerchantMemoryView({ formOptions, onAuthFailure }: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Auto-Ready" | "Learning" | "Locked">("All");
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [data, setData] = useState<MerchantMemoryData | null>(null);
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoadStatus("loading");
    const result = await callApi<MerchantMemoryData>("getMerchantMemory", {
      search: debouncedSearch,
      filter,
    });

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
  }, [debouncedSearch, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function withBusy(fn: () => Promise<{ ok: boolean; code?: string; error?: string }>) {
    setBusy(true);
    setError("");
    const result = await fn();
    setBusy(false);

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setError(result.error ?? "Something went wrong.");
      return;
    }

    await load();
  }

  async function handleToggleLock(merchantKey: string, locked: boolean) {
    await withBusy(() =>
      callApi(locked ? "unlockMerchantMemory" : "lockMerchantMemory", { merchantKey })
    );
  }

  async function handleDelete(merchantKey: string, merchant: string) {
    if (!window.confirm(`Delete the learned merchant "${merchant}"? This cannot be undone.`)) return;
    await withBusy(() => callApi("deleteMerchantMemory", { merchantKey }));
  }

  async function handleRebuild() {
    if (
      !window.confirm(
        "Rebuild merchant memory from existing manual transaction history?\n\nThis replaces the current learned merchant records."
      )
    ) {
      return;
    }
    await withBusy(() => callApi("rebuildMerchantMemory"));
  }

  return (
    <div className="gm-card gm-card--wide">
      <h2 style={{ marginTop: 0 }}>Merchant Memory</h2>

      {error && <p className="gm-error">{error}</p>}

      <button type="button" className="gm-button gm-button--secondary" disabled={busy} onClick={handleRebuild}>
        Rebuild from Transaction History
      </button>

      <div className="gm-field" style={{ marginTop: "1rem" }}>
        <label htmlFor="merchant-search">Search</label>
        <input
          id="merchant-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Merchant, category, or subcategory…"
        />
      </div>

      <div className="gm-field">
        <label htmlFor="merchant-filter">Filter</label>
        <select id="merchant-filter" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          {FILTER_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      {loadStatus === "loading" && <p>Loading…</p>}
      {loadStatus === "error" && <p className="gm-error">{error}</p>}

      {loadStatus === "ready" && data && (
        <>
          <div className="gm-register-summary">
            <div>
              <div className="gm-register-summary__label">Auto-Ready</div>
              <div className="gm-register-summary__value">{data.stats.autoLearned}</div>
            </div>
            <div>
              <div className="gm-register-summary__label">Locked</div>
              <div className="gm-register-summary__value">{data.stats.locked}</div>
            </div>
            <div>
              <div className="gm-register-summary__label">Total</div>
              <div className="gm-register-summary__value">{data.stats.merchants}</div>
            </div>
          </div>

          {data.records.length === 0 ? (
            <p>No merchants match.</p>
          ) : (
            <div className="gm-register-list">
              {data.records.map((record) =>
                editingKey === record.merchantKey ? (
                  <EditMerchantMemoryForm
                    key={record.merchantKey}
                    formOptions={formOptions}
                    record={record}
                    onAuthFailure={onAuthFailure}
                    onSaved={() => {
                      setEditingKey(null);
                      load();
                    }}
                    onCancel={() => setEditingKey(null)}
                  />
                ) : (
                  <div key={record.merchantKey} className="gm-register-row">
                    <div className="gm-register-row__top">
                      <div className="gm-register-row__main">
                        <div className="gm-register-row__payee">{record.merchant}</div>
                        <div className="gm-register-row__meta">
                          {record.category}
                          {record.subcategory ? ` → ${record.subcategory}` : ""} · Used {record.timesUsed}×
                        </div>
                      </div>
                      <div className="gm-register-row__amounts">
                        <div>{record.confidence}%</div>
                      </div>
                      <span className={statusClass(record.status)}>{record.status}</span>
                    </div>

                    <div className="gm-register-row__actions">
                      <button
                        type="button"
                        className="gm-link-button"
                        disabled={busy}
                        onClick={() => setEditingKey(record.merchantKey)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="gm-link-button"
                        disabled={busy}
                        onClick={() => handleToggleLock(record.merchantKey, record.locked)}
                      >
                        {record.locked ? "Unlock" : "Lock"}
                      </button>
                      <button
                        type="button"
                        className="gm-link-button"
                        disabled={busy}
                        onClick={() => handleDelete(record.merchantKey, record.merchant)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
