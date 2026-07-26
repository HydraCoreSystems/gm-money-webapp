"use client";

import { useState, useTransition } from "react";
import { CategoryPicker } from "./CategoryPicker";
import { approveReviewTransaction } from "@/app/review/actions";
import type { CategoryGroupOption } from "@/lib/categories";

type Selection = { categoryId: string; subcategoryId: string | null; type: "income" | "expense" };

type ReviewQueueProps = {
  queue: { id: string; date: string; description: string; amount: number; account: string }[];
  categoryGroups: CategoryGroupOption[];
};

type StatusState = { kind: "idle" | "success" | "error"; message: string };

export function ReviewQueue({ queue, categoryGroups }: ReviewQueueProps) {
  const [selectionById, setSelectionById] = useState<Record<string, Selection | null>>({});
  const [statusById, setStatusById] = useState<Record<string, StatusState>>({});
  const [isPending, startTransition] = useTransition();

  async function handleApprove(transactionId: string) {
    const selection = selectionById[transactionId];
    const formData = new FormData();
    formData.set("transactionId", transactionId);
    if (selection) {
      formData.set("categoryId", selection.categoryId);
      formData.set("subcategoryId", selection.subcategoryId ?? "");
    }

    const result = await approveReviewTransaction(formData);
    if (!result.ok) {
      setStatusById((prev) => ({ ...prev, [transactionId]: { kind: "error", message: result.error ?? "Could not approve this transaction." } }));
      return;
    }

    setStatusById((prev) => ({ ...prev, [transactionId]: { kind: "success", message: "Categorized." } }));
  }

  if (queue.length === 0) {
    return (
      <div className="gm-card gm-card--wide" style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div className="gm-panel-head" style={{ padding: "20px 22px 14px" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Nothing to review</h2>
        </div>
        <div style={{ padding: "0 22px 22px" }}>
          <p className="gm-register-note">There are no uncategorized bank transactions in the current view.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gm-card gm-card--wide" style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div className="gm-panel-head" style={{ padding: "20px 22px 14px" }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>Pending review</h2>
      </div>

      <div className="gm-register-list" style={{ padding: "0 22px 22px" }}>
        {queue.map((item) => {
          const selection = selectionById[item.id];
          const status = statusById[item.id];
          return (
            <div key={item.id} className="gm-register-row" style={{ display: "block" }}>
              <div className="gm-register-row__top">
                <div className="gm-register-row__main">
                  <div className="gm-register-row__payee">{item.description}</div>
                  <div className="gm-register-row__meta">{item.date} · {item.account}</div>
                </div>
                <div className="gm-register-row__amounts">
                  <div className={item.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"}>
                    {item.amount < 0 ? "-" : "+"}${Math.abs(item.amount).toFixed(2)}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <CategoryPicker
                  groups={categoryGroups}
                  value={selection ?? null}
                  onChange={(next) => setSelectionById((prev) => ({ ...prev, [item.id]: next }))}
                  categoryFieldName={`categoryId_${item.id}`}
                  subcategoryFieldName={`subcategoryId_${item.id}`}
                />
              </div>

              <div className="gm-panel-foot" style={{ marginTop: 12 }}>
                <span>{status?.message ?? "Choose a category to approve this transaction."}</span>
                <button
                  type="button"
                  className="gm-button gm-button--glow"
                  disabled={isPending || !selection}
                  onClick={() => startTransition(() => handleApprove(item.id))}
                >
                  {isPending ? "Saving…" : "Approve"}
                </button>
              </div>

              {status?.kind === "error" && <p className="gm-error">{status.message}</p>}
              {status?.kind === "success" && <p className="gm-success">{status.message}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
