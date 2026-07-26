"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CategoryPicker } from "@/components/CategoryPicker";
import { removeMerchantMemory, rebuildMerchantMemory, toggleMerchantLock, updateMerchantMemory } from "@/app/merchants/actions";
import type { CategoryGroupOption } from "@/lib/categories";
import type { MerchantMemoryData, MerchantMemoryRecord, MerchantMemoryStatus } from "@/lib/merchant-memory";

type Props = {
  data: MerchantMemoryData;
  categoryGroups: CategoryGroupOption[];
};

type Selection = { categoryId: string; subcategoryId: string | null; type: "income" | "expense" };

type EditDraft = {
  merchantKey: string;
  preferredName: string;
  selection: Selection | null;
};

const FILTER_OPTIONS: Array<"All" | MerchantMemoryStatus> = ["All", "Auto-Ready", "Learning", "Locked"];

function statusBadgeClass(status: MerchantMemoryStatus): string {
  switch (status) {
    case "Auto-Ready":
      return "gm-status-badge gm-status-badge--auto-ready";
    case "Locked":
      return "gm-status-badge gm-status-badge--locked";
    default:
      return "gm-status-badge";
  }
}

export function MerchantMemoryPanel({ data, categoryGroups }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | MerchantMemoryStatus>("All");
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.records.filter((record) => {
      const matchesFilter = filter === "All" || record.status === filter;
      const haystack = `${record.preferredName} ${record.categoryName} ${record.subcategoryName ?? ""}`.toLowerCase();
      const matchesSearch = !q || haystack.includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [data.records, filter, search]);

  function beginEdit(record: MerchantMemoryRecord) {
    setEditing({
      merchantKey: record.merchantKey,
      preferredName: record.preferredName,
      selection: {
        categoryId: record.categoryId,
        subcategoryId: null,
        type: "expense",
      },
    });
    setMessage(null);
    setError(null);
  }

  async function handleSave() {
    if (!editing) return;
    setError(null);
    const formData = new FormData();
    formData.set("merchantKey", editing.merchantKey);
    formData.set("preferredName", editing.preferredName);
    formData.set("categoryId", editing.selection?.categoryId ?? "");
    formData.set("subcategoryId", editing.selection?.subcategoryId ?? "");

    const result = await updateMerchantMemory(formData);
    if (!result.ok) {
      setError(result.error ?? "Could not save merchant memory.");
      return;
    }

    setMessage("Merchant memory updated.");
    setEditing(null);
    startTransition(() => router.refresh());
  }

  async function handleToggleLock(record: MerchantMemoryRecord) {
    setError(null);
    const formData = new FormData();
    formData.set("merchantKey", record.merchantKey);
    formData.set("locked", record.isLocked ? "false" : "true");
    const result = await toggleMerchantLock(formData);
    if (!result.ok) {
      setError(result.error ?? "Could not update lock state.");
      return;
    }

    setMessage(record.isLocked ? "Merchant unlocked." : "Merchant locked.");
    startTransition(() => router.refresh());
  }

  async function handleDelete(record: MerchantMemoryRecord) {
    if (!window.confirm(`Delete the learned merchant "${record.preferredName}"?`)) return;
    setError(null);
    const formData = new FormData();
    formData.set("merchantKey", record.merchantKey);
    const result = await removeMerchantMemory(formData);
    if (!result.ok) {
      setError(result.error ?? "Could not delete merchant memory.");
      return;
    }

    setMessage("Merchant memory removed.");
    startTransition(() => router.refresh());
  }

  async function handleRebuild() {
    if (!window.confirm("Rebuild merchant memory from existing transaction history?")) return;
    setError(null);
    const result = await rebuildMerchantMemory();
    if (!result.ok) {
      setError(result.error ?? "Could not rebuild merchant memory.");
      return;
    }

    setMessage("Merchant memory rebuilt.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="gm-card gm-card--wide" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div className="gm-panel-head" style={{ display: "flex", justifyContent: "space-between", padding: "20px 22px 14px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17 }}>Merchant Memory</h2>
          <p className="gm-register-note" style={{ margin: "4px 0 0" }}>Learned merchant rules that suggest categories during review.</p>
        </div>
        <button type="button" className="gm-link-button" onClick={handleRebuild} disabled={busy}>
          Rebuild from history
        </button>
      </div>

      <div style={{ padding: "0 22px 22px" }}>
        {message && <p className="gm-success">{message}</p>}
        {error && <p className="gm-error">{error}</p>}

        <div className="gm-register-summary" style={{ marginBottom: 16 }}>
          <div>
            <div className="gm-register-summary__label">Total</div>
            <div className="gm-register-summary__value">{data.stats.merchants}</div>
          </div>
          <div>
            <div className="gm-register-summary__label">Auto-Ready</div>
            <div className="gm-register-summary__value">{data.stats.autoLearned}</div>
          </div>
          <div>
            <div className="gm-register-summary__label">Locked</div>
            <div className="gm-register-summary__value">{data.stats.locked}</div>
          </div>
        </div>

        <div className="gm-settings-add-row" style={{ marginBottom: 16 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search merchants or categories" disabled={busy} />
          <select value={filter} onChange={(e) => setFilter(e.target.value as "All" | MerchantMemoryStatus)} disabled={busy}>
            {FILTER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {filteredRecords.length === 0 && <p className="gm-register-note">No rules match.</p>}

        <div className="gm-register-list">
          {filteredRecords.map((record) => (
            <div key={record.id} className="gm-register-row">
              <div className="gm-register-row__top">
                <div className="gm-register-row__main">
                  <div className="gm-register-row__payee">{record.preferredName}</div>
                  <div className="gm-register-row__meta">
                    {record.categoryName}
                    {record.subcategoryName ? ` → ${record.subcategoryName}` : ""} · Used {record.timesUsed}× · Confidence {record.confidence}%
                  </div>
                </div>
                <div className="gm-register-row__amounts">
                  <div>{record.confidence}%</div>
                </div>
                <span className={statusBadgeClass(record.status)}>{record.status}</span>
              </div>

              {editing?.merchantKey === record.merchantKey ? (
                <div className="gm-card" style={{ marginTop: 12, padding: 14 }}>
                  <div className="gm-field">
                    <label htmlFor="preferred-name">Preferred name</label>
                    <input
                      id="preferred-name"
                      value={editing.preferredName}
                      onChange={(e) => setEditing((prev) => prev ? { ...prev, preferredName: e.target.value } : prev)}
                      disabled={busy}
                    />
                  </div>

                  <CategoryPicker
                    groups={categoryGroups}
                    value={editing.selection}
                    onChange={(selection) => setEditing((prev) => prev ? { ...prev, selection } : prev)}
                    categoryFieldName="categoryId"
                    subcategoryFieldName="subcategoryId"
                  />

                  <div className="gm-edit-form__actions" style={{ marginTop: 12 }}>
                    <button type="button" className="gm-link-button" onClick={() => setEditing(null)} disabled={busy}>
                      Cancel
                    </button>
                    <button type="button" className="gm-link-button" onClick={handleSave} disabled={busy}>
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="gm-register-row__actions">
                  <button type="button" className="gm-link-button" onClick={() => beginEdit(record)} disabled={busy}>
                    Edit
                  </button>
                  <button type="button" className="gm-link-button" onClick={() => handleToggleLock(record)} disabled={busy}>
                    {record.isLocked ? "Unlock" : "Lock"}
                  </button>
                  <button type="button" className="gm-link-button" onClick={() => handleDelete(record)} disabled={busy}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
