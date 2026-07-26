"use client";

import { useEffect, useState, useTransition } from "react";
import { setBudget, deleteBudget } from "@/app/settings/actions";
import { addRecipient, saveRecipient, deleteRecipient } from "@/app/settings/notifications-actions";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs, type NotificationRecipient } from "@/lib/notifications";
import type { SettingsData } from "@/lib/settings";

type Props = {
  data: SettingsData & { notificationRecipients: NotificationRecipient[] };
};

export function SettingsPanel({ data }: Props) {
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  type ThemeChoice = "system" | "light" | "dark";
  const THEME_STORAGE_KEY = "gm-money-theme";

  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("system");
  const [newRecipientName, setNewRecipientName] = useState("");
  const [newRecipientEmail, setNewRecipientEmail] = useState("");
  const [recipientDrafts, setRecipientDrafts] = useState<Record<string, { name: string; prefs: NotificationPrefs }>>(
    Object.fromEntries(data.notificationRecipients.map((r) => [r.email, { name: r.name, prefs: r.prefs }]))
  );
  const [dirtyEmails, setDirtyEmails] = useState<Record<string, boolean>>({});
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeChoice | null;
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
      setThemeChoice(savedTheme);
    }
  }, []);

  useEffect(() => {
    if (themeChoice === "system") {
      document.documentElement.removeAttribute("data-theme");
      window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    } else {
      document.documentElement.setAttribute("data-theme", themeChoice);
      window.localStorage.setItem(THEME_STORAGE_KEY, themeChoice);
    }
  }, [themeChoice]);

  async function handleSaveBudget(categoryId: string) {
    const amount = (budgetDrafts[categoryId] ?? "").trim();
    setMessage(null);
    setError(null);
    const formData = new FormData();
    formData.set("categoryId", categoryId);
    formData.set("amount", amount);
    const result = await setBudget(formData);
    if (!result.ok) {
      setError(result.error ?? "Could not save budget.");
      return;
    }
    setMessage("Budget saved.");
  }

  async function handleDeleteBudget(categoryId: string) {
    setMessage(null);
    setError(null);
    const formData = new FormData();
    formData.set("categoryId", categoryId);
    const result = await deleteBudget(formData);
    if (!result.ok) {
      setError(result.error ?? "Could not clear budget.");
      return;
    }
    setBudgetDrafts((prev) => ({ ...prev, [categoryId]: "" }));
    setMessage("Budget cleared.");
  }

  async function handleAddRecipient() {
    const email = newRecipientEmail.trim();
    if (!email) return;
    setMessage(null);
    setError(null);
    const formData = new FormData();
    formData.set("name", newRecipientName);
    formData.set("email", email);
    const result = await addRecipient(formData);
    if (!result.ok) {
      setError(result.error ?? "Could not add recipient.");
      return;
    }
    setNewRecipientName("");
    setNewRecipientEmail("");
    setMessage("Recipient added.");
  }

  async function handleSaveRecipient(email: string) {
    const draft = recipientDrafts[email];
    if (!draft) return;
    setMessage(null);
    setError(null);
    const formData = new FormData();
    formData.set("email", email);
    formData.set("name", draft.name);
    formData.set("prefs", JSON.stringify(draft.prefs));
    const result = await saveRecipient(formData);
    if (!result.ok) {
      setError(result.error ?? "Could not save preferences.");
      return;
    }
    setDirtyEmails((prev) => ({ ...prev, [email]: false }));
    setMessage("Preferences saved.");
  }

  async function handleDeleteRecipient(email: string) {
    setMessage(null);
    setError(null);
    const formData = new FormData();
    formData.set("email", email);
    const result = await deleteRecipient(formData);
    if (!result.ok) {
      setError(result.error ?? "Could not remove recipient.");
      return;
    }
    setMessage("Recipient removed.");
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
      return {
        ...prev,
        [email]: { ...current, prefs: { ...current.prefs, ...patch } },
      };
    });
    setDirtyEmails((prev) => ({ ...prev, [email]: true }));
  }

  return (
    <div className="gm-card gm-card--wide" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="gm-panel-head" style={{ padding: "20px 22px 14px" }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>Settings</h2>
      </div>

      <div className="gm-settings-shell">
        {message && <p className="gm-success">{message}</p>}
        {error && <p className="gm-error">{error}</p>}

        <h3>Appearance</h3>
        <div className="gm-settings-add-row">
          <label htmlFor="themeChoice" style={{ marginRight: 8, whiteSpace: "nowrap" }}>Theme</label>
          <select
            id="themeChoice"
            value={themeChoice}
            onChange={(e) => setThemeChoice(e.target.value as ThemeChoice)}
            disabled={busy}
            style={{ minWidth: 170 }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <span style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
            System follows your device preference.
          </span>
        </div>

        <h3>Security</h3>
        <div className="gm-settings-add-row">
          <a href="/settings/password" className="gm-link-button">
            Change password
          </a>
          <a href="/settings/users" className="gm-link-button">
            Manage users
          </a>
          <span style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
            Registered users sign in with their own email and password.
          </span>
        </div>

        <h3>Notifications</h3>
        <p className="gm-register-note">Add people who should receive the daily digest. Each recipient keeps their own name and preference set.</p>
        {data.notificationRecipients.map((recipient) => {
          const draft = recipientDrafts[recipient.email] ?? { name: recipient.name, prefs: DEFAULT_NOTIFICATION_PREFS };
          const dirty = !!dirtyEmails[recipient.email];
          return (
            <div key={recipient.email} className="gm-settings-category gm-settings-category--compact">
              <div className="gm-settings-category__header">
                <input value={draft.name} onChange={(e) => updateRecipientName(recipient.email, e.target.value)} placeholder="Name" disabled={busy} style={{ maxWidth: 180 }} />
                <span className="gm-settings-meta">{recipient.email}</span>
                <button type="button" className="gm-link-button" disabled={busy} onClick={() => startTransition(() => handleDeleteRecipient(recipient.email))}>
                  Remove
                </button>
              </div>
              <label className="gm-notification-pref">
                <input type="checkbox" checked={draft.prefs.upcomingBills} onChange={(e) => updateRecipientPrefs(recipient.email, { upcomingBills: e.target.checked })} disabled={busy} />
                Upcoming bills (next 3 days)
              </label>
              <label className="gm-notification-pref">
                <input type="checkbox" checked={draft.prefs.overBudget} onChange={(e) => updateRecipientPrefs(recipient.email, { overBudget: e.target.checked })} disabled={busy} />
                Categories over budget
              </label>
              <label className="gm-notification-pref">
                <input type="checkbox" checked={draft.prefs.lowBalance} onChange={(e) => updateRecipientPrefs(recipient.email, { lowBalance: e.target.checked })} disabled={busy} />
                Low balance below
                <input type="number" step="1" min="0" value={draft.prefs.lowBalanceThreshold} disabled={busy || !draft.prefs.lowBalance} onChange={(e) => updateRecipientPrefs(recipient.email, { lowBalanceThreshold: Number(e.target.value) })} style={{ maxWidth: 96, marginLeft: 8 }} />
              </label>
              <label className="gm-notification-pref">
                <input type="checkbox" checked={draft.prefs.newDeposits} onChange={(e) => updateRecipientPrefs(recipient.email, { newDeposits: e.target.checked })} disabled={busy} />
                New deposits at least
                <input type="number" step="1" min="0" value={draft.prefs.newDepositThreshold} disabled={busy || !draft.prefs.newDeposits} onChange={(e) => updateRecipientPrefs(recipient.email, { newDepositThreshold: Number(e.target.value) })} style={{ maxWidth: 96, marginLeft: 8 }} />
              </label>
              <div className="gm-settings-add-row" style={{ marginTop: 8 }}>
                <button type="button" className="gm-link-button" disabled={busy || !dirty} onClick={() => startTransition(() => handleSaveRecipient(recipient.email))}>
                  Save preferences
                </button>
              </div>
            </div>
          );
        })}

        <h3>Budgets</h3>
        {data.budgets.map((budget) => (
          <div key={budget.id} className="gm-settings-add-row">
            <span style={{ flex: 1, minWidth: 180 }}>{budget.categoryName || budget.categoryId}</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={budgetDrafts[budget.categoryId] ?? (budget.amount != null ? String(budget.amount) : "")}
              onChange={(e) => setBudgetDrafts((prev) => ({ ...prev, [budget.categoryId]: e.target.value }))}
              placeholder="No budget"
              disabled={busy}
              style={{ maxWidth: 120 }}
            />
            <button type="button" className="gm-link-button" disabled={busy || !(budgetDrafts[budget.categoryId] ?? "").trim()} onClick={() => startTransition(() => handleSaveBudget(budget.categoryId))}>
              Save
            </button>
            <button type="button" className="gm-link-button" disabled={busy} onClick={() => startTransition(() => handleDeleteBudget(budget.categoryId))}>
              Clear
            </button>
          </div>
        ))}

        <h3>Recipients</h3>
        <div className="gm-settings-add-row gm-settings-add-row--tight">
          <input value={newRecipientName} onChange={(e) => setNewRecipientName(e.target.value)} placeholder="Recipient name" disabled={busy} />
          <input type="email" value={newRecipientEmail} onChange={(e) => setNewRecipientEmail(e.target.value)} placeholder="name@example.com" disabled={busy} />
          <button type="button" className="gm-link-button" disabled={busy || !newRecipientEmail.trim()} onClick={() => startTransition(() => handleAddRecipient())}>
            Add recipient
          </button>
        </div>

      </div>
    </div>
  );
}
