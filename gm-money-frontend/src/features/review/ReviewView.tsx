import { useEffect, useState } from "react";
import { callApi } from "../../api/client";
import type { FormOptions, ReviewTransaction } from "../../api/types";
import { ReviewEntryRow } from "./ReviewEntryRow";

type Props = {
  formOptions: FormOptions;
  onAuthFailure: () => void;
};

export function ReviewView({ formOptions, onAuthFailure }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [transactions, setTransactions] = useState<ReviewTransaction[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      const result = await callApi<ReviewTransaction[]>("getReviewTransactions");

      if (cancelled) return;

      if (!result.ok) {
        if (result.code === "BAD_PASSWORD") {
          onAuthFailure();
          return;
        }
        setError(result.error);
        setStatus("error");
        return;
      }

      setTransactions(result.data);
      setStatus("ready");
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApproved(sourceRow: number) {
    setTransactions((prev) => prev.filter((t) => t.sourceRow !== sourceRow));
  }

  return (
    <div className="gm-card gm-card--wide">
      <h2 style={{ marginTop: 0 }}>Review</h2>
      <p className="gm-register-note">
        New bank transactions land here until they're given a category — they won't show up in Register until then.
      </p>

      {status === "loading" && <p>Loading pending transactions… this can take a bit.</p>}
      {status === "error" && <p className="gm-error">{error}</p>}

      {status === "ready" && transactions.length === 0 && <p>Nothing to review right now.</p>}

      {status === "ready" && transactions.length > 0 && (
        <div className="gm-register-list">
          {transactions.map((t) => (
            <ReviewEntryRow
              key={t.sourceRow}
              transaction={t}
              formOptions={formOptions}
              onAuthFailure={onAuthFailure}
              onApproved={handleApproved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
