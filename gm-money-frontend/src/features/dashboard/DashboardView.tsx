import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { callApi, getStoredEnteredBy } from "../../api/client";
import type { DashboardData } from "../../api/types";
import { Avatar } from "../shared/Avatar";

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function formatMoneySigned(amount: number): string {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

// Projects a category's spend-so-far forward to a full-month estimate
// using how far through the month "today" is — catches "you're going
// to blow this budget" a couple weeks before it actually happens,
// rather than only flagging it after the fact once already over.
function projectMonthEndSpend(spentSoFar: number): number {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return spentSoFar * (daysInMonth / dayOfMonth);
}

// Each pie slice gets its own gradient (defined once below, referenced
// by id) rather than a flat fill — matches the gradient/depth language
// used everywhere else on this screen.
const PIE_GRADIENTS = [
  ["#1c7a4a", "#52b788"],
  ["#d9a441", "#f0cd83"],
  ["#a8391f", "#e0703f"],
  ["#123d25", "#2e8b57"],
  ["#7a2456", "#c34b8e"],
  ["#3d3480", "#7c5cd9"],
  ["#0f6e56", "#1d9e75"],
  ["#185fa5", "#378add"],
];
const PIE_OTHER_GRADIENT = ["#5f6f65", "#8a978d"];

// Money's own home screen (per the screenshot the user shared) only
// shows a handful of pie slices plus a "More…" catch-all — a full
// category breakdown (this data has 30+ real categories some months)
// is unreadable as a pie. Same idea here: top N by amount, everything
// else rolled into a single "Other" slice.
const TOP_CATEGORY_COUNT = 8;

type Props = {
  onAuthFailure: () => void;
};

export function DashboardView({ onAuthFailure }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      const result = await callApi<DashboardData>("getDashboard");

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

      setData(result.data);
      setStatus("ready");
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="gm-card gm-card--wide">
        <p>Loading dashboard… this can take a bit for accounts with a lot of history.</p>
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="gm-card gm-card--wide">
        <p className="gm-error">{error || "Could not load the dashboard."}</p>
      </div>
    );
  }

  // Already sorted largest-first by the backend.
  const topCategories = data.spendingByCategory.slice(0, TOP_CATEGORY_COUNT);
  const otherCategories = data.spendingByCategory.slice(TOP_CATEGORY_COUNT);
  const otherTotal = otherCategories.reduce((sum, c) => sum + c.amount, 0);
  const chartCategories =
    otherTotal > 0 ? [...topCategories, { category: "Other", amount: otherTotal }] : topCategories;

  const enteredBy = getStoredEnteredBy();

  return (
    <div className="gm-dashboard">
      <div className="gm-dashboard-hero">
        {enteredBy && (
          <div className="gm-dashboard-hero__who">
            <Avatar label={enteredBy} size={22} />
            {enteredBy}
          </div>
        )}
        <div className="gm-dashboard-hero__row">
          <div>
            <div className="gm-dashboard-hero__label">Current Cash</div>
            <div className="gm-dashboard-hero__value">{formatMoney(data.currentCash)}</div>
          </div>
          <div>
            <div className="gm-dashboard-hero__label">Projected Cash</div>
            <div className="gm-dashboard-hero__value gm-dashboard-hero__value--secondary">
              {formatMoney(data.projectedCash)}
            </div>
          </div>
        </div>
      </div>

      <div className="gm-metro-grid">
        <div className="gm-metro-tile gm-metro-tile--income">
          <div className="gm-metro-tile__label">Income This Month</div>
          <div className="gm-metro-tile__value">{formatMoney(data.incomeThisMonth)}</div>
        </div>
        <div className="gm-metro-tile gm-metro-tile--expenses">
          <div className="gm-metro-tile__label">Expenses This Month</div>
          <div className="gm-metro-tile__value">{formatMoney(data.expensesThisMonth)}</div>
        </div>
        <div className="gm-metro-tile gm-metro-tile--review">
          <div className="gm-metro-tile__label">Pending Review</div>
          <div className="gm-metro-tile__value">{data.pendingReviewCount}</div>
        </div>
        <div className="gm-metro-tile gm-metro-tile--uncleared">
          <div className="gm-metro-tile__label">Uncleared</div>
          <div className="gm-metro-tile__value">{data.unclearedCount}</div>
        </div>
      </div>

      <div className="gm-card gm-card--wide gm-dashboard-panel">
        <h3 style={{ marginTop: 0 }}>Spending by Category</h3>
        {chartCategories.length === 0 ? (
          <p>No expenses recorded yet this month.</p>
        ) : (
          <>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <defs>
                    {PIE_GRADIENTS.map(([from, to], index) => (
                      <linearGradient key={index} id={`pieGrad${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={from} />
                        <stop offset="100%" stopColor={to} />
                      </linearGradient>
                    ))}
                    <linearGradient id="pieGradOther" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={PIE_OTHER_GRADIENT[0]} />
                      <stop offset="100%" stopColor={PIE_OTHER_GRADIENT[1]} />
                    </linearGradient>
                  </defs>
                  <Pie
                    data={chartCategories}
                    dataKey="amount"
                    nameKey="category"
                    innerRadius={60}
                    outerRadius={110}
                    isAnimationActive={false}
                  >
                    {chartCategories.map((entry, index) => (
                      <Cell
                        key={entry.category}
                        fill={entry.category === "Other" ? "url(#pieGradOther)" : `url(#pieGrad${index % PIE_GRADIENTS.length})`}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatMoney(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="gm-register-list">
              {chartCategories.map((entry, index) => (
                <div key={entry.category} className="gm-dashboard-balance-row">
                  <span>
                    <span
                      style={{
                        display: "inline-block",
                        width: "0.7rem",
                        height: "0.7rem",
                        borderRadius: "50%",
                        background:
                          entry.category === "Other"
                            ? `linear-gradient(135deg, ${PIE_OTHER_GRADIENT[0]}, ${PIE_OTHER_GRADIENT[1]})`
                            : `linear-gradient(135deg, ${PIE_GRADIENTS[index % PIE_GRADIENTS.length][0]}, ${PIE_GRADIENTS[index % PIE_GRADIENTS.length][1]})`,
                        marginRight: "0.5rem",
                      }}
                    />
                    {entry.category === "Other"
                      ? `Other (${otherCategories.length} categor${otherCategories.length === 1 ? "y" : "ies"})`
                      : entry.category}
                  </span>
                  <span>{formatMoney(entry.amount)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {data.budgetProgress.length > 0 && (
        <div className="gm-card gm-card--wide gm-dashboard-panel">
          <h3 style={{ marginTop: 0 }}>Spending Tracker</h3>
          <div className="gm-budget-list">
            {data.budgetProgress.map((b) => {
              const pct = b.budgeted > 0 ? Math.min(100, (b.spent / b.budgeted) * 100) : 0;
              const over = b.spent > b.budgeted;
              const projected = projectMonthEndSpend(b.spent);
              // Skip the first few days of the month -- with almost no
              // days elapsed, one early transaction can extrapolate to
              // a wildly inflated month-end estimate and cry wolf.
              const onPaceToExceed = !over && new Date().getDate() >= 5 && projected > b.budgeted;
              return (
                <div key={b.category} className="gm-budget-row">
                  <div className="gm-budget-row__top">
                    <span>{b.category}</span>
                    <span className={over ? "gm-register-row__amount--negative" : undefined}>
                      {formatMoney(b.spent)} / {formatMoney(b.budgeted)}
                    </span>
                  </div>
                  <div className="gm-budget-bar">
                    <div
                      className="gm-budget-bar__fill"
                      style={{
                        width: `${pct}%`,
                        background: over ? "var(--gm-negative)" : "var(--gm-positive)",
                      }}
                    />
                  </div>
                  {onPaceToExceed && (
                    <p className="gm-budget-row__pace-warning">
                      On pace to exceed by ~{formatMoney(projected - b.budgeted)} this month
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="gm-card gm-card--wide gm-dashboard-panel">
        <h3 style={{ marginTop: 0 }}>Account Balances</h3>
        <div className="gm-register-list">
          {data.accountBalances.map((b) => (
            <div key={b.account} className="gm-dashboard-balance-row">
              <span>{b.account}</span>
              <span>{formatMoney(b.balance)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="gm-card gm-card--wide gm-dashboard-panel">
        <h3 style={{ marginTop: 0 }}>Recent Transactions</h3>
        <div className="gm-register-list">
          {data.recentTransactions.map((t, index) => (
            <div key={`${t.date}-${t.payee}-${index}`} className="gm-register-row">
              <div className="gm-register-row__top">
                <Avatar label={t.payee} />
                <div className="gm-register-row__main">
                  <div className="gm-register-row__payee">{t.payee}</div>
                  <div className="gm-register-row__meta">
                    {t.date} · {t.account} · {t.category}
                    {t.subcategory ? ` → ${t.subcategory}` : ""}
                  </div>
                </div>
                <div className={t.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"}>
                  {formatMoneySigned(t.amount)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
