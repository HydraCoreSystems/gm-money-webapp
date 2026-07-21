import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { callApi } from "../../api/client";
import type { DashboardData } from "../../api/types";

function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

// Reuses the same Windows Phone "live tile" color set as the metro
// tiles above, since the pie chart lives on this one live-tile screen
// too (per CLAUDE.md, that look is deliberately scoped to Dashboard
// only) — not the calmer moss palette used everywhere else.
const PIE_COLORS = [
  "#008a00",
  "#0050ef",
  "#00aba9",
  "#fa6800",
  "#d80073",
  "#6a00ff",
  "#a4c400",
  "#1ba1e2",
  "#aa00ff",
  "#f0a30a",
  "#a20025",
  "#647687",
];

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

  return (
    <div className="gm-dashboard">
      <div className="gm-metro-grid">
        <div className="gm-metro-tile gm-metro-tile--cash">
          <div className="gm-metro-tile__label">Current Cash</div>
          <div className="gm-metro-tile__value">{formatMoney(data.currentCash)}</div>
        </div>
        <div className="gm-metro-tile gm-metro-tile--projected">
          <div className="gm-metro-tile__label">Projected Cash</div>
          <div className="gm-metro-tile__value">{formatMoney(data.projectedCash)}</div>
        </div>
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
        {data.spendingByCategory.length === 0 ? (
          <p>No expenses recorded yet this month.</p>
        ) : (
          <>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={data.spendingByCategory}
                    dataKey="amount"
                    nameKey="category"
                    innerRadius={50}
                    outerRadius={90}
                    isAnimationActive={false}
                  >
                    {data.spendingByCategory.map((entry, index) => (
                      <Cell key={entry.category} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatMoney(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="gm-register-list">
              {data.spendingByCategory.map((entry, index) => (
                <div key={entry.category} className="gm-dashboard-balance-row">
                  <span>
                    <span
                      style={{
                        display: "inline-block",
                        width: "0.7rem",
                        height: "0.7rem",
                        borderRadius: "50%",
                        background: PIE_COLORS[index % PIE_COLORS.length],
                        marginRight: "0.5rem",
                      }}
                    />
                    {entry.category}
                  </span>
                  <span>{formatMoney(entry.amount)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

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
                <div className="gm-register-row__main">
                  <div className="gm-register-row__payee">{t.payee}</div>
                  <div className="gm-register-row__meta">
                    {t.date} · {t.account} · {t.category}
                    {t.subcategory ? ` → ${t.subcategory}` : ""}
                  </div>
                </div>
                <div className={t.amount < 0 ? "gm-register-row__amount--negative" : "gm-register-row__amount--positive"}>
                  {formatMoney(t.amount)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
