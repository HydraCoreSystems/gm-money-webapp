import { useId, useState, type FormEvent } from "react";
import { callApi } from "../../api/client";
import type { FormOptions, MerchantMemoryRecord } from "../../api/types";
import { CategoryPicker } from "../transaction-entry/CategoryPicker";

type Props = {
  formOptions: FormOptions;
  record: MerchantMemoryRecord;
  onAuthFailure: () => void;
  onSaved: () => void;
  onCancel: () => void;
};

export function EditMerchantMemoryForm({ formOptions, record, onAuthFailure, onSaved, onCancel }: Props) {
  const uid = useId();
  const [preferredMerchant, setPreferredMerchant] = useState(record.merchant);
  const [category, setCategory] = useState(record.category);
  const [subcategory, setSubcategory] = useState(record.subcategory);

  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError("");

    const result = await callApi("updateMerchantMemory", {
      merchantKey: record.merchantKey,
      preferredMerchant,
      category,
      subcategory,
    });

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setError(result.fieldErrors?.join(" ") ?? result.error);
      setStatus("idle");
      return;
    }

    onSaved();
  }

  return (
    <div className="gm-card gm-edit-form">
      <h3 style={{ marginTop: 0 }}>Edit Merchant</h3>

      {error && <p className="gm-error">{error}</p>}

      <form onSubmit={handleSubmit}>
        <div className="gm-field">
          <label htmlFor={`${uid}-preferred-merchant`}>Preferred Merchant</label>
          <input
            id={`${uid}-preferred-merchant`}
            type="text"
            value={preferredMerchant}
            onChange={(e) => setPreferredMerchant(e.target.value)}
            required
          />
        </div>

        <CategoryPicker
          groups={formOptions.categoryGroups}
          category={category}
          subcategory={subcategory}
          onChange={(next) => {
            setCategory(next.category);
            setSubcategory(next.subcategory);
          }}
        />

        <div className="gm-edit-form__actions">
          <button type="button" className="gm-button gm-button--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="gm-button" disabled={status === "submitting"}>
            {status === "submitting" ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
