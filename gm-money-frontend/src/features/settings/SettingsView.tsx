import { useEffect, useState } from "react";
import { callApi } from "../../api/client";
import type { AddCategoryResult, AddSubcategoryResult, FormOptions } from "../../api/types";

type Props = {
  onAuthFailure: () => void;
};

export function SettingsView({ onAuthFailure }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [error, setError] = useState("");

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<"Income" | "Expense">("Expense");
  const [subcategoryDrafts, setSubcategoryDrafts] = useState<Record<string, string>>({});
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setStatus("loading");
    const result = await callApi<FormOptions>("getFormOptions");

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setError(result.error);
      setStatus("error");
      return;
    }

    setOptions(result.data);
    setStatus("ready");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    await withBusy(() => callApi<AddCategoryResult>("addCategory", { name, type: newCategoryType }));
    setNewCategoryName("");
  }

  async function handleAddSubcategory(category: string) {
    const subcategory = (subcategoryDrafts[category] ?? "").trim();
    if (!subcategory) return;
    await withBusy(() => callApi<AddSubcategoryResult>("addSubcategory", { category, subcategory }));
    setSubcategoryDrafts((prev) => ({ ...prev, [category]: "" }));
  }

  async function handleDeleteSubcategory(category: string, subcategory: string) {
    if (!window.confirm(`Delete subcategory "${subcategory}" under "${category}"?`)) return;
    await withBusy(() => callApi("deleteSubcategory", { category, subcategory }));
  }

  async function handleDeleteCategory(category: string) {
    if (!window.confirm(`Delete category "${category}"? This only works if no transactions use it.`)) return;
    await withBusy(() => callApi("deleteCategory", { category }));
  }

  async function handleAddPaymentMethod() {
    const name = newPaymentMethod.trim();
    if (!name) return;
    await withBusy(() => callApi<{ name: string }>("addPaymentMethod", { name }));
    setNewPaymentMethod("");
  }

  async function handleDeletePaymentMethod(name: string) {
    if (!window.confirm(`Delete payment method "${name}"?`)) return;
    await withBusy(() => callApi("deletePaymentMethod", { name }));
  }

  if (status === "loading") {
    return (
      <div className="gm-card gm-card--wide">
        <p>Loading settings…</p>
      </div>
    );
  }

  if (status === "error" || !options) {
    return (
      <div className="gm-card gm-card--wide">
        <p className="gm-error">{error || "Could not load settings."}</p>
      </div>
    );
  }

  return (
    <div className="gm-card gm-card--wide">
      <h2 style={{ marginTop: 0 }}>Settings</h2>

      {error && <p className="gm-error">{error}</p>}

      <h3>Categories</h3>

      <div className="gm-settings-add-row">
        <input
          type="text"
          placeholder="New category name"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          disabled={busy}
        />
        <select
          value={newCategoryType}
          onChange={(e) => setNewCategoryType(e.target.value as "Income" | "Expense")}
          disabled={busy}
        >
          <option value="Expense">Expense</option>
          <option value="Income">Income</option>
        </select>
        <button type="button" className="gm-link-button" disabled={busy || !newCategoryName.trim()} onClick={handleAddCategory}>
          Add Category
        </button>
      </div>

      {options.categoryGroups.map((group) => (
        <div key={group.type} className="gm-settings-group">
          <h4>{group.type}</h4>
          {group.categories.map((cat) => (
            <div key={cat.name} className="gm-settings-category">
              <div className="gm-settings-category__header">
                <strong>{cat.name}</strong>
                <button
                  type="button"
                  className="gm-link-button"
                  disabled={busy}
                  onClick={() => handleDeleteCategory(cat.name)}
                >
                  Delete Category
                </button>
              </div>

              <ul className="gm-settings-subcategory-list">
                {cat.subcategories.map((sub) => (
                  <li key={sub}>
                    <span>{sub}</span>
                    <button
                      type="button"
                      className="gm-link-button"
                      disabled={busy}
                      onClick={() => handleDeleteSubcategory(cat.name, sub)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>

              <div className="gm-settings-add-row gm-settings-add-row--sub">
                <input
                  type="text"
                  placeholder="New subcategory"
                  value={subcategoryDrafts[cat.name] ?? ""}
                  onChange={(e) =>
                    setSubcategoryDrafts((prev) => ({ ...prev, [cat.name]: e.target.value }))
                  }
                  disabled={busy}
                />
                <button
                  type="button"
                  className="gm-link-button"
                  disabled={busy || !(subcategoryDrafts[cat.name] ?? "").trim()}
                  onClick={() => handleAddSubcategory(cat.name)}
                >
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      <h3>Payment Methods</h3>

      <div className="gm-settings-add-row">
        <input
          type="text"
          placeholder="New payment method"
          value={newPaymentMethod}
          onChange={(e) => setNewPaymentMethod(e.target.value)}
          disabled={busy}
        />
        <button type="button" className="gm-link-button" disabled={busy || !newPaymentMethod.trim()} onClick={handleAddPaymentMethod}>
          Add
        </button>
      </div>

      <ul className="gm-settings-subcategory-list">
        {options.paymentMethods.map((method) => (
          <li key={method}>
            <span>{method}</span>
            <button
              type="button"
              className="gm-link-button"
              disabled={busy}
              onClick={() => handleDeletePaymentMethod(method)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
