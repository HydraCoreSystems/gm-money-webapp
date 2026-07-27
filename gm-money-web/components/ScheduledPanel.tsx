"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createScheduled, removeScheduled, runScheduledAutopostNow, updateScheduled } from "@/app/scheduled/actions";
import { CategoryPicker } from "./CategoryPicker";
import type { CategoryGroupOption } from "@/lib/categories";
import type { ScheduledTransaction } from "@/lib/scheduled";

type Props = {
  categoryGroups: CategoryGroupOption[];
  accounts: { id: string; name: string }[];
  initialItems: ScheduledTransaction[];
};

const FREQUENCIES = ["Daily", "Weekly", "Every 2 Weeks", "Monthly", "Quarterly", "Yearly"];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addMonthsClamped(dateKey: string, months: number): string {
  const current = parseDateKey(dateKey);
  const day = current.getDate();
  const monthIndex = current.getMonth() + months;
  const year = current.getFullYear() + Math.floor(monthIndex / 12);
  const normalizedMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(year, normalizedMonth + 1, 0).getDate();
  return toDateKey(new Date(year, normalizedMonth, Math.min(day, lastDay)));
}

function advanceDueDate(dueDate: string, frequency: string | null): string {
  const normalized = String(frequency || "monthly").trim().toLowerCase().replace(/\s+/g, "");
  if (normalized === "daily") {
    const next = parseDateKey(dueDate);
    next.setDate(next.getDate() + 1);
    return toDateKey(next);
  }
  if (normalized === "weekly") {
    const next = parseDateKey(dueDate);
    next.setDate(next.getDate() + 7);
    return toDateKey(next);
  }
  if (normalized === "every2weeks" || normalized === "everytwoweeks" || normalized === "biweekly") {
    const next = parseDateKey(dueDate);
    next.setDate(next.getDate() + 14);
    return toDateKey(next);
  }
  if (normalized === "quarterly") return addMonthsClamped(dueDate, 3);
  if (normalized === "yearly" || normalized === "annually") return addMonthsClamped(dueDate, 12);
  return addMonthsClamped(dueDate, 1);
}

type CalendarOccurrence = {
  itemId: string;
  date: string;
  payee: string;
  amount: number;
};

function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

type Selection = { categoryId: string; subcategoryId: string | null; type: "income" | "expense" };

export function ScheduledPanel({ categoryGroups, accounts, initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [frequency, setFrequency] = useState("Monthly");
  const [nextDue, setNextDue] = useState(todayLocalDate());
  const [occurrenceLimit, setOccurrenceLimit] = useState("");
  const [active, setActive] = useState(true);
  const [autoCreate, setAutoCreate] = useState(true);
  const [notes, setNotes] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayLocalDate());
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSelection, setEditSelection] = useState<Selection | null>(null);
  const [editPayee, setEditPayee] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editAccountId, setEditAccountId] = useState(accounts[0]?.id ?? "");
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editFrequency, setEditFrequency] = useState("Monthly");
  const [editNextDue, setEditNextDue] = useState(todayLocalDate());
  const [editOccurrenceLimit, setEditOccurrenceLimit] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editAutoCreate, setEditAutoCreate] = useState(true);
  const [editNotes, setEditNotes] = useState("");

  useEffect(() => setItems(initialItems), [initialItems]);

  const calendarOccurrences = useMemo(() => {
    const monthStart = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    const monthEnd = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
    const occurrences: CalendarOccurrence[] = [];

    for (const item of items) {
      if (!item.active) continue;
      let due = item.nextDue;
      let generated = item.occurrencesGenerated;
      const limit = item.occurrenceLimit;

      for (let loop = 0; loop < 90; loop++) {
        if (limit !== null && generated >= limit) break;
        const dueDate = parseDateKey(due);
        if (dueDate > monthEnd) break;
        if (dueDate >= monthStart) {
          occurrences.push({ itemId: item.id, date: due, payee: item.payee, amount: item.amount });
        }
        generated += 1;
        const next = advanceDueDate(due, item.frequency);
        due = next <= due ? toDateKey(new Date(dueDate.getTime() + 24 * 60 * 60 * 1000)) : next;
      }
    }

    occurrences.sort((a, b) => (a.date === b.date ? a.payee.localeCompare(b.payee) : a.date.localeCompare(b.date)));
    return occurrences;
  }, [items, monthAnchor]);

  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const occurrence of calendarOccurrences) {
      const bucket = map.get(occurrence.date) ?? [];
      bucket.push(occurrence);
      map.set(occurrence.date, bucket);
    }
    return map;
  }, [calendarOccurrences]);

  const selectedDayOccurrences = occurrencesByDate.get(selectedDate) ?? [];

  const categorySelectionByLeafId = useMemo(() => {
    const map = new Map<string, Selection>();
    for (const group of categoryGroups) {
      for (const category of group.categories) {
        map.set(category.id, { categoryId: category.id, subcategoryId: null, type: group.type });
        for (const sub of category.subcategories) {
          map.set(sub.id, { categoryId: category.id, subcategoryId: sub.id, type: group.type });
        }
      }
    }
    return map;
  }, [categoryGroups]);

  const calendarGrid = useMemo(() => {
    const first = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay());
    const grid: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      grid.push(day);
    }
    return grid;
  }, [monthAnchor]);

  function moveMonth(delta: number) {
    setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("payee", payee);
    formData.set("amount", amount);
    formData.set("accountId", accountId);
    formData.set("categoryId", selection?.categoryId ?? "");
    formData.set("subcategoryId", selection?.subcategoryId ?? "");
    formData.set("paymentMethod", paymentMethod);
    formData.set("frequency", frequency);
    formData.set("nextDue", nextDue);
    formData.set("occurrenceLimit", occurrenceLimit);
    formData.set("active", active ? "true" : "false");
    formData.set("autoCreate", autoCreate ? "true" : "false");
    formData.set("notes", notes);
    const result = await createScheduled(formData);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save scheduled transaction.");
      return;
    }
    setPayee("");
    setAmount("");
    setNotes("");
    setOccurrenceLimit("");
    setSelection(null);
    setMessage("Scheduled transaction saved and automation checked.");
    router.refresh();
  }

  async function handleDelete(id: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await removeScheduled(id);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not delete scheduled transaction.");
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
    setMessage("Scheduled transaction removed.");
    router.refresh();
  }

  async function handleRunAutopost() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await runScheduledAutopostNow();
    setSaving(false);
    if (!result.ok || !result.stats) {
      setError(result.error ?? "Could not run scheduled autopost.");
      return;
    }
    setMessage(
      `Autopost complete: ${result.stats.createdTransactions} posted, ${result.stats.completedSchedules} completed, ${result.stats.skippedSchedules} skipped.`,
    );
    router.refresh();
  }

  function handleDuplicateDraft(item: ScheduledTransaction) {
    setPayee(item.payee);
    setAmount(String(item.amount));
    setAccountId(item.accountId ?? accounts[0]?.id ?? "");
    setPaymentMethod(item.paymentMethod ?? "");
    setFrequency(item.frequency ?? "Monthly");
    setNextDue(item.nextDue);
    setOccurrenceLimit(item.occurrenceLimit == null ? "" : String(item.occurrenceLimit));
    setActive(item.active);
    setAutoCreate(item.autoCreate);
    setNotes(item.notes ?? "");
    setSelection(item.categoryId ? categorySelectionByLeafId.get(item.categoryId) ?? null : null);
    setMessage(`Draft populated from ${item.payee}. Review and click Add scheduled.`);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function beginEdit(item: ScheduledTransaction) {
    setEditingId(item.id);
    setEditPayee(item.payee);
    setEditAmount(String(item.amount));
    setEditAccountId(item.accountId ?? accounts[0]?.id ?? "");
    setEditPaymentMethod(item.paymentMethod ?? "");
    setEditFrequency(item.frequency ?? "Monthly");
    setEditNextDue(item.nextDue);
    setEditOccurrenceLimit(item.occurrenceLimit == null ? "" : String(item.occurrenceLimit));
    setEditActive(item.active);
    setEditAutoCreate(item.autoCreate);
    setEditNotes(item.notes ?? "");
    setEditSelection(item.categoryId ? categorySelectionByLeafId.get(item.categoryId) ?? null : null);
    setError(null);
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditSelection(null);
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("payee", editPayee);
    formData.set("amount", editAmount);
    formData.set("accountId", editAccountId);
    formData.set("categoryId", editSelection?.categoryId ?? "");
    formData.set("subcategoryId", editSelection?.subcategoryId ?? "");
    formData.set("paymentMethod", editPaymentMethod);
    formData.set("frequency", editFrequency);
    formData.set("nextDue", editNextDue);
    formData.set("occurrenceLimit", editOccurrenceLimit);
    formData.set("active", editActive ? "true" : "false");
    formData.set("autoCreate", editAutoCreate ? "true" : "false");
    formData.set("notes", editNotes);
    const result = await updateScheduled(id, formData);
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not update scheduled transaction.");
      return;
    }
    setMessage("Scheduled transaction updated.");
    setEditingId(null);
    router.refresh();
  }

  return (
    <div className="gm-card gm-card--wide gm-scheduled-shell" style={{ maxWidth: 1120, margin: "0 auto" }}>
      <div className="gm-panel-head" style={{ padding: "20px 22px 14px" }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>Scheduled transactions</h2>
      </div>
      <div style={{ padding: "0 22px 22px" }}>
        {message && <p className="gm-success">{message}</p>}
        {error && <p className="gm-error">{error}</p>}

        <div className="gm-scheduled-calendar" style={{ marginTop: 8 }}>
          <div className="gm-scheduled-calendar__head">
            <h3>{monthLabel(monthAnchor)}</h3>
            <div>
              <button type="button" className="gm-link-button" onClick={() => moveMonth(-1)}>Prev</button>
              <button type="button" className="gm-link-button" onClick={() => moveMonth(1)}>Next</button>
            </div>
          </div>

          <div className="gm-scheduled-calendar__weekdays">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="gm-scheduled-calendar__grid">
            {calendarGrid.map((day) => {
              const key = toDateKey(day);
              const dayItems = occurrencesByDate.get(key) ?? [];
              const inMonth = day.getMonth() === monthAnchor.getMonth();
              const isToday = key === todayLocalDate();
              const isSelected = key === selectedDate;
              return (
                <button
                  key={key}
                  type="button"
                  className={
                    isSelected
                      ? "gm-scheduled-calendar__day gm-scheduled-calendar__day--selected"
                      : inMonth
                        ? "gm-scheduled-calendar__day"
                        : "gm-scheduled-calendar__day gm-scheduled-calendar__day--outside"
                  }
                  onClick={() => setSelectedDate(key)}
                >
                  {dayItems.length > 0 && <span className="gm-scheduled-calendar__day-dot" aria-hidden="true" />}
                  <strong>{day.getDate()}</strong>
                  {isToday && <small>Today</small>}
                  {dayItems.length > 0 && <em>{dayItems.length} due</em>}
                </button>
              );
            })}
          </div>

          <div className="gm-scheduled-calendar__agenda">
            <h4>{parseDateKey(selectedDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h4>
            {selectedDayOccurrences.length === 0 ? (
              <p className="gm-register-note">No scheduled occurrences for this day.</p>
            ) : (
              selectedDayOccurrences.map((occurrence) => (
                <div key={`${occurrence.itemId}-${occurrence.date}-${occurrence.payee}`} className="gm-scheduled-calendar__agenda-row">
                  <span>{occurrence.payee}</span>
                  <strong>{occurrence.amount < 0 ? "-" : "+"}${Math.abs(occurrence.amount).toFixed(2)}</strong>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="gm-form-grid gm-form-grid--three">
          <div className="gm-field">
            <label>Payee</label>
            <input value={payee} onChange={(e) => setPayee(e.target.value)} />
          </div>
          <div className="gm-field">
            <label>Amount</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="gm-field">
            <label>Account</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((accountOption) => (
                <option key={accountOption.id} value={accountOption.id}>{accountOption.name}</option>
              ))}
            </select>
          </div>
        </div>

        <CategoryPicker
          groups={categoryGroups}
          value={selection}
          onChange={setSelection}
          categoryFieldName="scheduledCategoryId"
          subcategoryFieldName="scheduledSubcategoryId"
        />

        <div className="gm-form-grid gm-form-grid--three" style={{ marginTop: 14 }}>
          <div className="gm-field">
            <label>Payment method</label>
            <input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
          </div>
          <div className="gm-field">
            <label>Frequency</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {FREQUENCIES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="gm-field">
            <label>Next due</label>
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </div>
        </div>

        <div className="gm-form-grid gm-form-grid--three" style={{ marginTop: 10 }}>
          <div className="gm-field">
            <label>Number of payments</label>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Leave blank for ongoing"
              value={occurrenceLimit}
              onChange={(e) => setOccurrenceLimit(e.target.value)}
            />
          </div>
          <div className="gm-field">
            <label>Autopost mode</label>
            <input value={autoCreate ? "Posts to register on due date" : "Manual only"} readOnly />
          </div>
          <div className="gm-field">
            <label>Category type</label>
            <input value={selection?.type ? selection.type : "Select category"} readOnly />
          </div>
        </div>

        <div className="gm-who-picker" style={{ marginTop: 12 }}>
          <button type="button" className={active ? "gm-who-picker__selected" : ""} onClick={() => setActive((prev) => !prev)}>{active ? "Active ✓" : "Inactive"}</button>
          <button type="button" className={autoCreate ? "gm-who-picker__selected" : ""} onClick={() => setAutoCreate((prev) => !prev)}>{autoCreate ? "Auto Create ✓" : "Manual Only"}</button>
        </div>

        <div className="gm-field">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="gm-panel-foot">
          <span>Recurring entries post automatically on or after the due date when Auto Create is enabled.</span>
          <div className="gm-scheduled-actions">
            <button type="button" className="gm-button gm-button--secondary" disabled={saving} onClick={() => void handleRunAutopost()}>
              Run autopost now
            </button>
            <button type="button" className="gm-button gm-button--glow" disabled={saving} onClick={() => void handleCreate()}>
            {saving ? "Saving…" : "Add scheduled"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          {items.length === 0 && <p className="gm-register-note">No scheduled transactions yet.</p>}
          {items.map((item) => (
            <div key={item.id} className="gm-register-row">
              <div className="gm-register-row__top">
                <div className="gm-register-row__main">
                  <div className="gm-register-row__payee">{item.payee}</div>
                  <div className="gm-register-row__meta">
                    {item.nextDue} · {item.frequency ?? "—"} · {item.account} · {item.occurrenceLimit ? `${item.occurrencesGenerated}/${item.occurrenceLimit} posted` : `${item.occurrencesGenerated} posted`}
                  </div>
                </div>
                <div className="gm-register-row__amounts">
                  <div className={item.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"}>${Math.abs(item.amount).toFixed(2)}</div>
                </div>
              </div>
              <div className="gm-panel-foot" style={{ marginTop: 12 }}>
                <span>
                  {item.active ? "Active" : "Inactive"} · {item.autoCreate ? "Auto create" : "Manual"}
                  {item.completedAt ? ` · Completed ${item.completedAt.slice(0, 10)}` : ""}
                </span>
                <div className="gm-scheduled-row-actions">
                  <button type="button" className="gm-link-button" disabled={saving} onClick={() => handleDuplicateDraft(item)}>
                    Duplicate
                  </button>
                  {editingId === item.id ? (
                    <button type="button" className="gm-link-button" disabled={saving} onClick={cancelEdit}>
                      Cancel
                    </button>
                  ) : (
                    <button type="button" className="gm-link-button" disabled={saving} onClick={() => beginEdit(item)}>
                      Edit
                    </button>
                  )}
                  <button type="button" className="gm-link-button" disabled={saving} onClick={() => void handleDelete(item.id)}>
                    Delete
                  </button>
                </div>
              </div>

              {editingId === item.id && (
                <div className="gm-scheduled-edit-box">
                  <div className="gm-form-grid gm-form-grid--three">
                    <div className="gm-field">
                      <label>Payee</label>
                      <input value={editPayee} onChange={(e) => setEditPayee(e.target.value)} />
                    </div>
                    <div className="gm-field">
                      <label>Amount</label>
                      <input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                    </div>
                    <div className="gm-field">
                      <label>Account</label>
                      <select value={editAccountId} onChange={(e) => setEditAccountId(e.target.value)}>
                        {accounts.map((accountOption) => (
                          <option key={accountOption.id} value={accountOption.id}>{accountOption.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <CategoryPicker
                    groups={categoryGroups}
                    value={editSelection}
                    onChange={setEditSelection}
                    categoryFieldName={`editCategoryId-${item.id}`}
                    subcategoryFieldName={`editSubcategoryId-${item.id}`}
                  />

                  <div className="gm-form-grid gm-form-grid--three" style={{ marginTop: 10 }}>
                    <div className="gm-field">
                      <label>Frequency</label>
                      <select value={editFrequency} onChange={(e) => setEditFrequency(e.target.value)}>
                        {FREQUENCIES.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </div>
                    <div className="gm-field">
                      <label>Next due</label>
                      <input type="date" value={editNextDue} onChange={(e) => setEditNextDue(e.target.value)} />
                    </div>
                    <div className="gm-field">
                      <label>Number of payments</label>
                      <input type="number" min="1" step="1" value={editOccurrenceLimit} onChange={(e) => setEditOccurrenceLimit(e.target.value)} />
                    </div>
                  </div>

                  <div className="gm-form-grid gm-form-grid--two" style={{ marginTop: 10 }}>
                    <div className="gm-field">
                      <label>Payment method</label>
                      <input value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)} />
                    </div>
                    <div className="gm-field">
                      <label>Notes</label>
                      <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                    </div>
                  </div>

                  <div className="gm-who-picker" style={{ marginTop: 8 }}>
                    <button type="button" className={editActive ? "gm-who-picker__selected" : ""} onClick={() => setEditActive((prev) => !prev)}>
                      {editActive ? "Active ✓" : "Inactive"}
                    </button>
                    <button type="button" className={editAutoCreate ? "gm-who-picker__selected" : ""} onClick={() => setEditAutoCreate((prev) => !prev)}>
                      {editAutoCreate ? "Auto Create ✓" : "Manual Only"}
                    </button>
                    <button type="button" className="gm-button gm-button--glow" disabled={saving} onClick={() => void handleSaveEdit(item.id)}>
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
