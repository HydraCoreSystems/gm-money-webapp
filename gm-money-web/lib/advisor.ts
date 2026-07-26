import type { DashboardData } from "./dashboard";

export type AdvisorTone = "good" | "watch" | "alert";

export type AdvisorInsight = {
  id: string;
  title: string;
  message: string;
  action: string;
  tone: AdvisorTone;
};

export type AdvisorBrief = {
  headline: string;
  generatedAt: string;
  insights: AdvisorInsight[];
};

function money(amount: number): string {
  return `$${Math.round(Math.abs(amount)).toLocaleString()}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function monthBounds(today: Date): { monthKey: string; elapsedDays: number; totalDays: number } {
  const month = today.getMonth() + 1;
  const monthKey = `${today.getFullYear()}-${String(month).padStart(2, "0")}`;
  const elapsedDays = today.getDate();
  const totalDays = new Date(today.getFullYear(), month, 0).getDate();
  return { monthKey, elapsedDays, totalDays };
}

export function buildAdvisorBrief(data: DashboardData, now = new Date()): AdvisorBrief {
  const { monthKey, elapsedDays, totalDays } = monthBounds(now);
  const monthRows = data.cashflowSeries.filter((d) => d.date.startsWith(monthKey));

  const monthIncomeFromSeries = monthRows.reduce((sum, row) => sum + row.income, 0);
  const monthExpenseFromSeries = monthRows.reduce((sum, row) => sum + row.expense, 0);
  const projectedExpense = elapsedDays > 0 ? (monthExpenseFromSeries / elapsedDays) * totalDays : monthExpenseFromSeries;
  const projectedIncome = elapsedDays > 0 ? (monthIncomeFromSeries / elapsedDays) * totalDays : monthIncomeFromSeries;

  const cashOnHand = data.accounts.reduce((sum, a) => sum + a.balance, 0);
  const avgDailyExpense = monthExpenseFromSeries > 0 ? monthExpenseFromSeries / Math.max(1, elapsedDays) : 0;
  const runwayDays = avgDailyExpense > 0 ? cashOnHand / avgDailyExpense : 999;

  const topCategory = data.spendingByCategory[0] ?? null;
  const topCategoryShare = topCategory && monthExpenseFromSeries > 0 ? topCategory.amount / monthExpenseFromSeries : 0;

  const last7 = data.cashflowSeries.slice(-7);
  const last7Income = last7.reduce((sum, row) => sum + row.income, 0);
  const last7Expense = last7.reduce((sum, row) => sum + row.expense, 0);
  const last7Net = last7Income - last7Expense;

  const insights: AdvisorInsight[] = [];

  insights.push({
    id: "runway",
    title: "Cash runway",
    message:
      runwayDays >= 45
        ? `Current cash covers roughly ${Math.round(runwayDays)} days at this month's spend pace.`
        : `Current cash covers roughly ${Math.max(0, Math.round(runwayDays))} days at this month's spend pace.`,
    action:
      runwayDays >= 45
        ? "Keep autopost schedules active and protect this buffer."
        : "Reduce discretionary spend or pull income forward to extend runway above 30 days.",
    tone: runwayDays >= 45 ? "good" : runwayDays >= 25 ? "watch" : "alert",
  });

  const paceGap = projectedExpense - projectedIncome;
  insights.push({
    id: "pace",
    title: "Month-end pace forecast",
    message:
      paceGap > 0
        ? `At current pace, expenses project near ${money(projectedExpense)} versus ${money(projectedIncome)} income.`
        : `At current pace, income projects near ${money(projectedIncome)} against ${money(projectedExpense)} expenses.`,
    action:
      paceGap > 0
        ? "Prioritize high-margin sales and delay non-urgent purchases this week."
        : "You are pacing ahead this month; lock in gains and avoid expense creep.",
    tone: paceGap > 300 ? "alert" : paceGap > 0 ? "watch" : "good",
  });

  if (topCategory) {
    insights.push({
      id: "concentration",
      title: `Top spend: ${topCategory.category}`,
      message: `${topCategory.category} is ${percent(topCategoryShare)} of this month's tracked expense flow (${money(topCategory.amount)}).`,
      action:
        topCategoryShare >= 0.35
          ? "Review this category line-by-line for cost controls or better supplier terms."
          : "Monitor this category weekly to keep concentration risk low.",
      tone: topCategoryShare >= 0.35 ? "watch" : "good",
    });
  }

  insights.push({
    id: "workflow",
    title: "Operations queue",
    message: `${data.pendingReviewCount} transactions still need review and ${data.unclearedCount} are uncleared.`,
    action:
      data.pendingReviewCount > 8
        ? "Clear review backlog to keep reporting and category trends reliable."
        : "Review queue is manageable; keep it near-zero for cleaner analytics.",
    tone: data.pendingReviewCount > 8 ? "alert" : data.pendingReviewCount > 0 ? "watch" : "good",
  });

  insights.push({
    id: "weekly-net",
    title: "Last 7 days trend",
    message:
      last7Net >= 0
        ? `Net flow over the last 7 days is positive at ${money(last7Net)}.`
        : `Net flow over the last 7 days is negative at ${money(last7Net)}.`,
    action: last7Net >= 0 ? "Keep momentum by preserving margin on current channels." : "Investigate the biggest 3 outflows and cut one this week.",
    tone: last7Net >= 0 ? "good" : "watch",
  });

  const alertCount = insights.filter((i) => i.tone === "alert").length;
  const watchCount = insights.filter((i) => i.tone === "watch").length;
  const headline =
    alertCount > 0
      ? `Co-CFO briefing: ${alertCount} urgent focus area${alertCount > 1 ? "s" : ""} today.`
      : watchCount > 0
        ? `Co-CFO briefing: ${watchCount} watch item${watchCount > 1 ? "s" : ""} to tighten this week.`
        : "Co-CFO briefing: healthy momentum across cashflow and operations.";

  return {
    headline,
    generatedAt: now.toISOString(),
    insights,
  };
}
