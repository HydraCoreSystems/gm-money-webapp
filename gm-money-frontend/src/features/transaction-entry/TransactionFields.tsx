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
  const preview =
    type && amountText
      ? `${type === "Income" ? "+" : "-"}$${Number(amountText || 0).toFixed(2)} (${type})`
      : null;

  return (
    <>
      <div className="gm-field">
        <label htmlFor="date">Date</label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          required
        />
      </div>

      <div className="gm-field">
        <label htmlFor="account">Account</label>
        <select id="account" value={account} onChange={(e) => onAccountChange(e.target.value)} required>
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
        <label htmlFor="payee">Payee</label>
        <input
          id="payee"
          type="text"
          value={payee}
          onChange={(e) => onPayeeChange(e.target.value)}
          required
        />
      </div>

      <div className="gm-field">
        <label htmlFor="amount">Amount</label>
        <input
          id="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          value={amountText}
          onChange={(e) => onAmountChange(e.target.value)}
          required
        />
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

      <div className="gm-field">
        <label htmlFor="paymentMethod">Payment Method</label>
        <select
          id="paymentMethod"
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

      <div className="gm-field">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" value={notes} onChange={(e) => onNotesChange(e.target.value)} />
      </div>
    </>
  );
}
