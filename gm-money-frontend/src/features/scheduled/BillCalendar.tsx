import { useMemo, useState } from "react";
import type { ScheduledTransaction } from "../../api/types";
import { Avatar } from "../shared/Avatar";

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

// Deliberately NOT `new Date(dateString)` -- that parses date-only ISO
// strings as UTC midnight, which can silently display as the previous
// day once converted to local time. Same reasoning as the backend's own
// parseDateOnly_.
function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDayOfTargetMonth));
  return target;
}

function addFrequency(date: Date, frequency: string): Date {
  const next = new Date(date);

  switch (frequency) {
    case "Weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "Every 2 Weeks":
      next.setDate(next.getDate() + 14);
      return next;
    case "Quarterly":
      return addMonthsClamped(date, 3);
    case "Yearly":
      return addMonthsClamped(date, 12);
    case "Monthly":
    default:
      return addMonthsClamped(date, 1);
  }
}

type Occurrence = {
  date: string;
  scheduleId: string;
  payee: string;
  amount: number;
  category: string;
  subcategory: string;
};

function computeOccurrences(items: ScheduledTransaction[], viewYear: number, viewMonth: number): Occurrence[] {
  const rangeStart = new Date(viewYear, viewMonth, 1);
  const rangeEnd = new Date(viewYear, viewMonth + 1, 0);
  const occurrences: Occurrence[] = [];

  items
    .filter((item) => item.active)
    .forEach((item) => {
      let cursor = parseDateOnly(item.nextDue);
      let guard = 0;

      // A capped walk, not a true recurrence-rule engine: fast-forwards
      // through any occurrences before this month (e.g. an overdue
      // schedule that hasn't been processed yet) without displaying
      // them, then records every occurrence that falls within the
      // visible month -- more than one for Weekly/Every 2 Weeks.
      while (cursor <= rangeEnd && guard < 500) {
        if (cursor >= rangeStart) {
          occurrences.push({
            date: formatDateOnly(cursor),
            scheduleId: item.scheduleId,
            payee: item.payee,
            amount: item.amount,
            category: item.category,
            subcategory: item.subcategory,
          });
        }
        cursor = addFrequency(cursor, item.frequency);
        guard++;
      }
    });

  return occurrences.sort((a, b) => a.date.localeCompare(b.date));
}

function getCalendarGridDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  const days: Date[] = [];

  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  return days;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Props = {
  items: ScheduledTransaction[];
};

export function BillCalendar({ items }: Props) {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const occurrences = useMemo(
    () => computeOccurrences(items, viewYear, viewMonth),
    [items, viewYear, viewMonth]
  );

  const occurrencesByDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    occurrences.forEach((occ) => {
      const list = map.get(occ.date) ?? [];
      list.push(occ);
      map.set(occ.date, list);
    });
    return map;
  }, [occurrences]);

  const gridDays = useMemo(() => getCalendarGridDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayKey = formatDateOnly(today);

  function goToMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  return (
    <div className="gm-calendar">
      <div className="gm-calendar-header">
        <button
          type="button"
          className="gm-link-button"
          onClick={() => goToMonth(-1)}
          aria-label="Previous month"
        >
          ‹ Prev
        </button>
        <div className="gm-calendar-title">
          {MONTH_LABELS[viewMonth]} {viewYear}
        </div>
        <button type="button" className="gm-link-button" onClick={() => goToMonth(1)} aria-label="Next month">
          Next ›
        </button>
      </div>

      <div className="gm-calendar-grid">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="gm-calendar-weekday">
            {label}
          </div>
        ))}

        {gridDays.map((day) => {
          const key = formatDateOnly(day);
          const dayOccurrences = occurrencesByDay.get(key) ?? [];
          const isOutside = day.getMonth() !== viewMonth;
          const isToday = key === todayKey;
          const visibleDots = dayOccurrences.slice(0, 3);
          const extraCount = dayOccurrences.length - visibleDots.length;

          return (
            <div
              key={key}
              className={
                "gm-calendar-day" +
                (isOutside ? " gm-calendar-day--outside" : "") +
                (isToday ? " gm-calendar-day--today" : "")
              }
              title={dayOccurrences.map((o) => `${o.payee} ${formatMoney(o.amount)}`).join("\n")}
            >
              <span>{day.getDate()}</span>
              {dayOccurrences.length > 0 && (
                <div className="gm-calendar-day__dots">
                  {visibleDots.map((occ, index) => (
                    <span
                      key={`${occ.scheduleId}-${index}`}
                      className="gm-calendar-dot"
                      style={{ background: occ.amount < 0 ? "var(--negative)" : "var(--positive)" }}
                    />
                  ))}
                  {extraCount > 0 && <span className="gm-calendar-day__more">+{extraCount}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h4 style={{ marginTop: "1.25rem", marginBottom: "0.5rem" }}>
        Upcoming in {MONTH_LABELS[viewMonth]}
      </h4>

      {occurrences.length === 0 ? (
        <p className="gm-register-note">Nothing scheduled this month.</p>
      ) : (
        <div className="gm-register-list">
          {occurrences.map((occ, index) => (
            <div key={`${occ.scheduleId}-${occ.date}-${index}`} className="gm-register-row">
              <div className="gm-register-row__top">
                <Avatar label={occ.payee} />
                <div className="gm-register-row__main">
                  <div className="gm-register-row__payee">{occ.payee}</div>
                  <div className="gm-register-row__meta">
                    {occ.date} · {occ.category}
                    {occ.subcategory ? ` › ${occ.subcategory}` : ""}
                  </div>
                </div>
                <div className="gm-register-row__amounts">
                  <div className={occ.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"}>
                    {formatMoney(occ.amount)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
