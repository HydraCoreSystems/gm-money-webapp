import { useEffect, useState } from "react";
import { callApi } from "../../api/client";
import type {
  AddCategoryResult,
  AddSubcategoryResult,
  BudgetRecord,
  FormOptions,
  NotificationPrefs,
  NotificationRecipient,
  NotificationSettings,
} from "../../api/types";

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  upcomingBills: true,
  overBudget: true,
  lowBalance: false,
  lowBalanceThreshold: 100,
  newDeposits: false,
  newDepositThreshold: 0,
};

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

  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});

  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [recipientDrafts, setRecipientDrafts] = useState<
    Record<string, { name: string; prefs: NotificationPrefs }>
  >({});
  const [dirtyEmails, setDirtyEmails] = useState<Record<string, boolean>>({});
  const [newRecipientName, setNewRecipientName] = useState("");
  const [newRecipientEmail, setNewRecipientEmail] = useState("");
  const [testMessage, setTestMessage] = useState("");

  async function load() {
    setStatus("loading");
    const [optionsResult, budgetsResult, notificationsResult] = await Promise.all([
      callApi<FormOptions>("getFormOptions"),
      callApi<BudgetRecord[]>("getBudgets"),
      callApi<NotificationSettings>("getNotificationSettings"),
    ]);

    if (!optionsResult.ok) {
      if (optionsResult.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setError(optionsResult.error);
      setStatus("error");
      return;
    }

    setOptions(optionsResult.data);

    if (budgetsResult.ok) {
      setBudgets(budgetsResult.data);
      setBudgetDrafts(
        Object.fromEntries(budgetsResult.data.map((b) => [b.category, String(b.monthlyBudget)]))
      );
    }

    if (notificationsResult.ok) {
      setRecipients(notificationsResult.data.recipients);
      setRecipientDrafts(
        Object.fromEntries(
          notificationsResult.data.recipients.map((r) => [r.email, { name: r.name, prefs: r.prefs }])
        )
      );
      setDirtyEmails({});
    }

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

  async function handleSaveBudget(category: string) {
    const monthlyBudget = Number(budgetDrafts[category]);
    if (!isFinite(monthlyBudget) || monthlyBudget <= 0) return;
    await withBusy(() => callApi("setBudget", { category, monthlyBudget }));
  }

  async function handleClearBudget(category: string) {
    if (!window.confirm(`Stop tracking a budget for "${category}"?`)) return;
    await withBusy(() => callApi("deleteBudget", { category }));
    setBudgetDrafts((prev) => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
  }

  async function handleAddRecipient() {
    const email = newRecipientEmail.trim();
    if (!email) return;
    setTestMessage("");
    await withBusy(() =>
      callApi("addNotificationRecipient", { name: newRecipientName.trim(), email })
    );
    setNewRecipientName("");
    setNewRecipientEmail("");
  }

  async function handleRemoveRecipient(email: string) {
    if (!window.confirm(`Remove ${email} from notifications?`)) return;
    setTestMessage("");
    await withBusy(() => callApi("removeNotificationRecipient", { email }));
  }

  function updateRecipientName(email: string, name: string) {
    setRecipientDrafts((prev) => ({
      ...prev,
      [email]: { ...(prev[email] ?? { name: "", prefs: DEFAULT_NOTIFICATION_PREFS }), name },
    }));
    setDirtyEmails((prev) => ({ ...prev, [email]: true }));
  }

  function updateRecipientPrefs(email: string, patch: Partial<NotificationPrefs>) {
    setRecipientDrafts((prev) => {
      const current = prev[email] ?? { name: "", prefs: DEFAULT_NOTIFICATION_PREFS };
      return { ...prev, [email]: { ...current, prefs: { ...current.prefs, ...patch } } };
    });
    setDirtyEmails((prev) => ({ ...prev, [email]: true }));
  }

  async function handleSaveRecipient(email: string) {
    const draft = recipientDrafts[email];
    if (!draft) return;
    setTestMessage("");
    await withBusy(() =>
      callApi("updateNotificationRecipient", { email, name: draft.name, prefs: draft.prefs })
    );
  }

  async function handleSendTestNotification(email?: string) {
    setBusy(true);
    setError("");
    setTestMessage("");
    const result = await callApi("sendTestNotification", email ? { email } : {});
    setBusy(false);

    if (!result.ok) {
      if (result.code === "BAD_PASSWORD") {
        onAuthFailure();
        return;
      }
      setError(result.error);
      return;
    }

    setTestMessage(
      email ? `Test email sent to ${email} — check the inbox in a minute.` : "Test email sent — check your inbox in a minute."
    );
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

      <h3>Notifications</h3>
      <p className="gm-register-note">
        Get a daily email when bills are due within 3 days or a category goes over budget. Nothing
        is sent on days with nothing to report. Each person below has their own name and their own
        preferences — add anyone who should be notified.
      </p>

      {testMessage && <p className="gm-success">{testMessage}</p>}

      {recipients.map((r) => {
        const draft = recipientDrafts[r.email] ?? { name: r.name, prefs: r.prefs };
        const dirty = !!dirtyEmails[r.email];

        return (
          <div key={r.email} className="gm-settings-category">
            <div className="gm-settings-category__header">
              <input
                type="text"
                placeholder="Name (optional)"
                value={draft.name}
                disabled={busy}
                onChange={(e) => updateRecipientName(r.email, e.target.value)}
                style={{ maxWidth: "10rem" }}
              />
              <span className="gm-register-note" style={{ margin: 0, flex: 1 }}>
                {r.email}
              </span>
              <button
                type="button"
                className="gm-link-button"
                disabled={busy}
                onClick={() => handleRemoveRecipient(r.email)}
              >
                Remove
              </button>
            </div>

            <label className="gm-notification-pref">
              <input
                type="checkbox"
                checked={draft.prefs.upcomingBills}
                disabled={busy}
                onChange={(e) => updateRecipientPrefs(r.email, { upcomingBills: e.target.checked })}
              />
              Upcoming bills (next 3 days)
            </label>

            <label className="gm-notification-pref">
              <input
                type="checkbox"
                checked={draft.prefs.overBudget}
                disabled={busy}
                onChange={(e) => updateRecipientPrefs(r.email, { overBudget: e.target.checked })}
              />
              Categories over budget
            </label>

            <label className="gm-notification-pref">
              <input
                type="checkbox"
                checked={draft.prefs.lowBalance}
                disabled={busy}
                onChange={(e) => updateRecipientPrefs(r.email, { lowBalance: e.target.checked })}
              />
              Low account balance, below
              <input
                type="number"
                step="1"
                min="0"
                value={draft.prefs.lowBalanceThreshold}
                disabled={busy || !draft.prefs.lowBalance}
                onChange={(e) =>
                  updateRecipientPrefs(r.email, { lowBalanceThreshold: Number(e.target.value) })
                }
                className="gm-notification-pref__amount"
              />
            </label>

            <label className="gm-notification-pref">
              <input
                type="checkbox"
                checked={draft.prefs.newDeposits}
                disabled={busy}
                onChange={(e) => updateRecipientPrefs(r.email, { newDeposits: e.target.checked })}
              />
              New deposits, at least
              <input
                type="number"
                step="1"
                min="0"
                value={draft.prefs.newDepositThreshold}
                disabled={busy || !draft.prefs.newDeposits}
                onChange={(e) =>
                  updateRecipientPrefs(r.email, { newDepositThreshold: Number(e.target.value) })
                }
                className="gm-notification-pref__amount"
              />
            </label>

            <div className="gm-settings-add-row" style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                className="gm-link-button"
                disabled={busy || !dirty}
                onClick={() => handleSaveRecipient(r.email)}
              >
                Save Preferences
              </button>
              <button
                type="button"
                className="gm-link-button"
                disabled={busy}
                onClick={() => handleSendTestNotification(r.email)}
              >
                Send Test Email
              </button>
            </div>
          </div>
        );
      })}

      <div className="gm-settings-add-row">
        <input
          type="text"
          placeholder="Name (optional)"
          value={newRecipientName}
          onChange={(e) => setNewRecipientName(e.target.value)}
          disabled={busy}
        />
        <input
          type="email"
          placeholder="name@example.com"
          value={newRecipientEmail}
          onChange={(e) => setNewRecipientEmail(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className="gm-link-button"
          disabled={busy || !newRecipientEmail.trim()}
          onClick={handleAddRecipient}
        >
          Add Person
        </button>
      </div>

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

      <h3>Budgets</h3>
      <p className="gm-register-note">
        Set a monthly spending plan for any Expense category — shows as a progress bar on the Dashboard.
        Leave blank for categories you don't want to track.
      </p>

      {options.categoryGroups
        .filter((group) => group.type === "Expense")
        .flatMap((group) => group.categories)
        .map((cat) => {
          const hasBudget = budgets.some((b) => b.category === cat.name);
          return (
            <div key={cat.name} className="gm-settings-add-row">
              <span style={{ flex: 1, minWidth: "10rem" }}>{cat.name}</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="No budget"
                value={budgetDrafts[cat.name] ?? ""}
                onChange={(e) => setBudgetDrafts((prev) => ({ ...prev, [cat.name]: e.target.value }))}
                disabled={busy}
                style={{ maxWidth: "7rem" }}
              />
              <button
                type="button"
                className="gm-link-button"
                disabled={busy || !(budgetDrafts[cat.name] ?? "").trim()}
                onClick={() => handleSaveBudget(cat.name)}
              >
                Save
              </button>
              {hasBudget && (
                <button
                  type="button"
                  className="gm-link-button"
                  disabled={busy}
                  onClick={() => handleClearBudget(cat.name)}
                >
                  Clear
                </button>
              )}
            </div>
          );
        })}

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
