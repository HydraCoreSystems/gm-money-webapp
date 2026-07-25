import { useId } from "react";
import type { FormOptions } from "../../api/types";
import { CategoryPicker } from "./CategoryPicker";

type Props = {
  formOptions: FormOptions;
  date: string;
  onDateChange: (value: string) => void;
  account: string;
  onAccountChange: (value: string) => void;
  payee: string;
  onPayeeChange: (value: string) => void;
  amountText: string;
  onAmountChange: (value: string) => void;
  category: string;
  subcategory: string;
  type: "Income" | "Expense" | "";
  onCategoryChange: (next: { category: string; subcategory: string; type: "Income" | "Expense" }) => void;
  paymentMethod: string;
  onPaymentMethodChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
};

export function TransactionFields({
  formOptions,
  date,
  onDateChange,
  account,
  onAccountChange,
  payee,
  onPayeeChange,
  amountText,
  onAmountChange,
  category,
  subcategory,
  type,
  onCategoryChange,
  paymentMethod,
  onPaymentMethodChange,
  notes,
  onNotesChange,
}: Props) {
  const uid = useId();
  const preview =
    type && amountText
      ? `${type === "Income" ? "+" : "-"}$${Number(amountText || 0).toFixed(2)} (${type})`
      : null;

  return (
    <>
      <div className="gm-section-heading">
        <div className="gm-section-heading__icon">$</div>
        <div>
          <h2>What happened?</h2>
          <p>
            The category you choose below decides Income or Expense for this transaction — there's no
            separate type field to get out of sync.
          </p>
        </div>
      </div>

      <div className="gm-form-grid gm-form-grid--three">
        <div className="gm-field">
          <label htmlFor={`${uid}-date`}>Date</label>
          <input
            id={`${uid}-date`}
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            required
          />
        </div>

        <div className="gm-field">
          <label htmlFor={`${uid}-account`}>Account</label>
          <select id={`${uid}-account`} value={account} onChange={(e) => onAccountChange(e.target.value)} required>
            <option value="" disabled>
              Choose an account…
            </option>
            {formOptions.accounts.map((acc) => (
              <option key={acc} value={acc}>
                {acc}
              </option>
            ))}
          </select>
        </div>

        <div className="gm-field">
          <label htmlFor={`${uid}-amount`}>Amount</label>
          <input
            id={`${uid}-amount`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={amountText}
            onChange={(e) => onAmountChange(e.target.value)}
            required
          />
        </div>
      </div>

      <CategoryPicker
        groups={formOptions.categoryGroups}
        category={category}
        subcategory={subcategory}
        onChange={onCategoryChange}
      />

      {preview && (
        <p className={`gm-preview gm-preview--${type === "Income" ? "income" : "expense"}`}>{preview}</p>
      )}

      <div className="gm-form-grid gm-form-grid--two">
        <div className="gm-field">
          <label htmlFor={`${uid}-payee`}>Payee</label>
          <input
            id={`${uid}-payee`}
            type="text"
            value={payee}
            onChange={(e) => onPayeeChange(e.target.value)}
            required
          />
        </div>

        <div className="gm-field">
          <label htmlFor={`${uid}-paymentMethod`}>Payment Method</label>
          <select
            id={`${uid}-paymentMethod`}
            value={paymentMethod}
            onChange={(e) => onPaymentMethodChange(e.target.value)}
            required
          >
            <option value="" disabled>
              Choose a payment method…
            </option>
            {formOptions.paymentMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="gm-field">
        <label htmlFor={`${uid}-notes`}>Notes</label>
        <textarea id={`${uid}-notes`} value={notes} onChange={(e) => onNotesChange(e.target.value)} />
      </div>
    </>
  );
}
