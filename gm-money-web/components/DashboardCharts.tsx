"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { DashboardData } from "@/lib/dashboard";

type Props = {
  cashflowSeries: DashboardData["cashflowSeries"];
  spendingByCategory: DashboardData["spendingByCategory"];
};

const PIE_COLORS = ["#1f5a36", "#2e7048", "#8a5a22", "#4c6f5a", "#9b6f34", "#6a8e77"];

function formatCompactMoney(amount: number): string {
  return `$${Math.round(amount).toLocaleString()}`;
}

function shortDate(date: string): string {
  return date.slice(5);
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function tooltipSeriesName(name: string): string {
  if (name === "income") return "Income";
  if (name === "expense") return "Expense";
  return "Net";
}

function dateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(year, (month || 1) - 1, day || 1);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DashboardCharts({ cashflowSeries, spendingByCategory }: Props) {
  const [activeSlice, setActiveSlice] = useState(0);

  const hasCashflow = cashflowSeries.some((d) => d.income > 0 || d.expense > 0);
  const hasSpendBreakdown = spendingByCategory.length > 0;
  const totalSpend = useMemo(() => spendingByCategory.reduce((sum, row) => sum + row.amount, 0), [spendingByCategory]);
  const focusedSlice = spendingByCategory[activeSlice] ?? spendingByCategory[0] ?? null;

  function percentOfTotal(amount: number): string {
    if (!totalSpend) return "0%";
    return `${Math.round((amount / totalSpend) * 100)}%`;
  }

  return (
    <div className="gm-dashboard-charts" style={{ maxWidth: 1200, margin: "22px auto 0" }}>
      <div className="gm-card gm-dashboard-chart-card">
        <div className="gm-panel-head gm-dashboard-chart-head">
          <h2>30-Day Cashflow Pulse</h2>
          <p>Income, expenses, and net rhythm over the last month.</p>
        </div>
        <div className="gm-dashboard-chart-frame">
          {hasCashflow ? (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashflowSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3f8d60" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3f8d60" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c65e56" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#c65e56" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="netStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#c38f41" />
                      <stop offset="100%" stopColor="#8d5d1d" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "var(--muted)" }} minTickGap={24} />
                  <YAxis tickFormatter={formatCompactMoney} tick={{ fontSize: 11, fill: "var(--muted)" }} width={70} />
                  <Tooltip
                    formatter={(value, name) => [formatCompactMoney(asNumber(value)), tooltipSeriesName(String(name))]}
                    labelFormatter={(label) => dateLabel(String(label))}
                    allowEscapeViewBox={{ x: true, y: true }}
                    offset={22}
                    wrapperStyle={{ zIndex: 20, transform: "translateY(-12px)" }}
                    contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="#3f8d60"
                    fill="url(#incomeFill)"
                    strokeWidth={2.25}
                    isAnimationActive
                    animationDuration={950}
                    animationEasing="ease-out"
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke="#c65e56"
                    fill="url(#expenseFill)"
                    strokeWidth={2.25}
                    isAnimationActive
                    animationBegin={130}
                    animationDuration={950}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="url(#netStroke)"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 6"
                    isAnimationActive
                    animationBegin={280}
                    animationDuration={900}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="gm-dashboard-cashflow-legend" aria-label="Cashflow legend">
                <span><i className="gm-dashboard-cashflow-legend__dot gm-dashboard-cashflow-legend__dot--income" />Income</span>
                <span><i className="gm-dashboard-cashflow-legend__dot gm-dashboard-cashflow-legend__dot--expense" />Expenses</span>
                <span><i className="gm-dashboard-cashflow-legend__dot gm-dashboard-cashflow-legend__dot--net" />Net</span>
              </div>
            </>
          ) : (
            <p className="gm-register-note gm-dashboard-chart-empty">No transactions in the current chart window yet.</p>
          )}
        </div>
      </div>

      <div className="gm-card gm-dashboard-chart-card">
        <div className="gm-panel-head gm-dashboard-chart-head">
          <h2>Expense Constellation</h2>
          <p>Top categories and where your outflow is clustering.</p>
        </div>
        <div className="gm-dashboard-chart-frame gm-dashboard-chart-frame--pie">
          {hasSpendBreakdown ? (
            <div className="gm-dashboard-pie-layout">
              <div className="gm-dashboard-pie-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={spendingByCategory}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={86}
                      innerRadius={66}
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {spendingByCategory.map((entry, idx) => {
                        const active = idx === activeSlice;
                        return (
                          <Cell
                            key={entry.category}
                            fill={PIE_COLORS[idx % PIE_COLORS.length]}
                            stroke={active ? "#f4f8f3" : "transparent"}
                            strokeWidth={active ? 3 : 1}
                            opacity={active ? 1 : 0.4}
                            style={{ transition: "opacity 150ms ease, stroke-width 150ms ease", cursor: "pointer" }}
                            onMouseEnter={() => setActiveSlice(idx)}
                          />
                        );
                      })}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="gm-dashboard-pie-center">
                  <span>Total Spend</span>
                  <strong>{formatCompactMoney(totalSpend)}</strong>
                  {focusedSlice && <em>{focusedSlice.category}</em>}
                </div>
              </div>
              <ul className="gm-dashboard-pie-legend" aria-label="Expense category breakdown">
                {spendingByCategory.map((entry, idx) => (
                  <li key={entry.category}>
                    <button
                      type="button"
                      className={idx === activeSlice ? "gm-dashboard-pie-legend__row--active" : undefined}
                      style={idx === activeSlice ? { borderColor: PIE_COLORS[idx % PIE_COLORS.length] } : undefined}
                      onMouseEnter={() => setActiveSlice(idx)}
                      onFocus={() => setActiveSlice(idx)}
                    >
                      <span className="gm-dashboard-pie-dot" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} aria-hidden="true" />
                      <span className="gm-dashboard-pie-label">{entry.category}</span>
                      <span className="gm-dashboard-pie-value">{percentOfTotal(entry.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="gm-register-note gm-dashboard-chart-empty">No expense-category activity this month yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
