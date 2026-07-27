import { getSupabaseServerClient, getBusinessId } from "./supabase";
import { processDueScheduledTransactions } from "./scheduled";

// Per the owner's explicit instruction: nothing before this date should
// be considered "current" activity. The 2+ years of pre-existing history
// that was originally migrated has since been purged outright (2026-07-26)
// for a clean slate -- this filter is now mostly a no-op safety net rather
// than the thing doing the real work, but kept in case older rows ever
// reappear (e.g. a stale Tiller row synced late). This does NOT affect
// account balances (those are real point-in-time snapshots, unaffected by
// which transactions we choose to display).
export const CUTOFF_DATE = "2026-07-19";
const CHART_DAY_WINDOW = 30;

// Floored at CUTOFF_DATE, same pattern as chartWindowStart() below --
// calendar-month-start alone would (harmlessly, today) reach back before
// the cutoff since nothing currently exists in that gap, but that's
// fragile: the moment any data reappears there for any reason, "This
// Month" would silently include it while every other stat on this screen
// explicitly excludes it.
function startOfMonth(): string {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  return key < CUTOFF_DATE ? CUTOFF_DATE : key;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function chartWindowStart(): string {
  const now = new Date();
  now.setDate(now.getDate() - (CHART_DAY_WINDOW - 1));
  const key = toDateKey(now);
  return key < CUTOFF_DATE ? CUTOFF_DATE : key;
}

export type DashboardData = {
  accounts: { id: string; name: string; balance: number }[];
  incomeThisMonth: number;
  expensesThisMonth: number;
  pendingReviewCount: number;
  unclearedCount: number;
  recentTransactions: {
    id: string;
    date: string;
    description: string;
    amount: number;
    account: string;
    category: string | null;
    status: string;
  }[];
  cashflowSeries: {
    date: string;
    income: number;
    expense: number;
    net: number;
  }[];
  spendingByCategory: {
    category: string;
    amount: number;
  }[];
  syncStatus: {
    lastSyncAt: string | null;
    status: "success" | "error" | "unknown";
    processedCount: number | null;
    message: string | null;
  };
};

export async function getDashboardData(): Promise<DashboardData> {
  await processDueScheduledTransactions();

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  // Accounts + their real current balance. account_balance_snapshots is
  // kept fresh by the Tiller sync (accounts.opening_balance is only the
  // value as of the original migration, so prefer the latest snapshot and
  // only fall back to opening_balance if a given account somehow has no
  // snapshot rows yet).
  const [{ data: accounts, error: accountsError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
    supabase.from("accounts").select("id, name, opening_balance").eq("business_id", businessId).eq("is_active", true),
    supabase
      .from("account_balance_snapshots")
      .select("account_id, balance, balance_date")
      .eq("business_id", businessId)
      .order("balance_date", { ascending: false })
      .limit(200),
  ]);
  if (accountsError) throw new Error(accountsError.message);
  if (snapshotsError) throw new Error(snapshotsError.message);

  const latestBalanceByAccount = new Map<string, number>();
  for (const snap of snapshots ?? []) {
    if (!latestBalanceByAccount.has(snap.account_id)) {
      latestBalanceByAccount.set(snap.account_id, Number(snap.balance));
    }
  }

  const resolvedAccounts = (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    balance: latestBalanceByAccount.get(a.id) ?? Number(a.opening_balance),
  }));

  // Income/expenses this month, driven by category type (never the raw
  // sign of the amount) -- the one rule this whole data model must never
  // violate, per CLAUDE.md.
  const { data: monthTx, error: monthTxError } = await supabase
    .from("transactions")
    .select("amount, transaction_date, categories(category_type, name)")
    .eq("business_id", businessId)
    .gte("transaction_date", startOfMonth());
  if (monthTxError) throw new Error(monthTxError.message);

  let incomeThisMonth = 0;
  let expensesThisMonth = 0;
  for (const t of monthTx ?? []) {
    const category = t.categories as unknown as { category_type: string; name: string | null } | null;
    const categoryType = category?.category_type;
    const amount = Math.abs(Number(t.amount));
    if (categoryType === "income") incomeThisMonth += amount;
    else if (categoryType === "expense") expensesThisMonth += amount;
  }

  const spendingByCategoryMap = new Map<string, number>();
  for (const t of monthTx ?? []) {
    const category = t.categories as unknown as { category_type: string; name: string | null } | null;
    if (category?.category_type !== "expense") continue;
    const key = category.name || "Uncategorized";
    const amount = Math.abs(Number(t.amount));
    spendingByCategoryMap.set(key, (spendingByCategoryMap.get(key) ?? 0) + amount);
  }

  const spendingByCategory = [...spendingByCategoryMap.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  const cashflowStart = chartWindowStart();
  const { data: chartTx, error: chartTxError } = await supabase
    .from("transactions")
    .select("transaction_date, amount, categories(category_type)")
    .eq("business_id", businessId)
    .gte("transaction_date", cashflowStart)
    .order("transaction_date", { ascending: true });
  if (chartTxError) throw new Error(chartTxError.message);

  const days: { date: string; income: number; expense: number; net: number }[] = [];
  const start = new Date(cashflowStart + "T00:00:00");
  const end = new Date();
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push({ date: toDateKey(d), income: 0, expense: 0, net: 0 });
  }
  const byDate = new Map(days.map((d) => [d.date, d]));

  for (const tx of chartTx ?? []) {
    const bucket = byDate.get(tx.transaction_date);
    if (!bucket) continue;
    const categoryType = (tx.categories as unknown as { category_type: string } | null)?.category_type;
    const amount = Math.abs(Number(tx.amount));
    if (categoryType === "income") bucket.income += amount;
    else if (categoryType === "expense") bucket.expense += amount;
    bucket.net = bucket.income - bucket.expense;
  }

  // "Pending review" = bank-fed transactions nobody has ever categorized
  // (review_status is essentially unset on ~4,600 old migrated rows, so
  // it isn't a usable signal here -- source+category_id is what actually
  // matches the old app's real definition: "new bank transactions land
  // here until they're given a category"). Both counts scoped to the
  // owner's July-1-onward cutoff, same as everything else on this screen.
  const [{ count: pendingReviewCount }, { count: unclearedCount }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("source", "tiller")
      .is("category_id", null)
      .gte("transaction_date", CUTOFF_DATE),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "uncleared")
      .gte("transaction_date", CUTOFF_DATE),
  ]);

  const { data: recent, error: recentError } = await supabase
    .from("transactions")
    .select("id, transaction_date, description, amount, status, accounts(name), categories(name)")
    .eq("business_id", businessId)
    .gte("transaction_date", CUTOFF_DATE)
    .order("transaction_date", { ascending: false })
    .limit(8);
  if (recentError) throw new Error(recentError.message);

  let syncStatus: DashboardData["syncStatus"] = {
    lastSyncAt: null,
    status: "unknown",
    processedCount: null,
    message: null,
  };

  const syncEventRes = await supabase
    .from("sync_events")
    .select("received_at, status, processed_count, error_message")
    .eq("business_id", businessId)
    .eq("source", "tiller_sync")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (syncEventRes.error) {
    const errText = `${syncEventRes.error.code ?? ""} ${syncEventRes.error.message ?? ""}`.toLowerCase();
    const syncEventsMissing = errText.includes("sync_events") && (errText.includes("42p01") || errText.includes("does not exist") || errText.includes("pgrst"));
    if (!syncEventsMissing) throw new Error(syncEventRes.error.message);
  } else if (syncEventRes.data) {
    syncStatus = {
      lastSyncAt: String(syncEventRes.data.received_at ?? "") || null,
      status: syncEventRes.data.status === "success" ? "success" : syncEventRes.data.status === "error" ? "error" : "unknown",
      processedCount: syncEventRes.data.processed_count == null ? null : Number(syncEventRes.data.processed_count),
      message: syncEventRes.data.error_message == null ? null : String(syncEventRes.data.error_message),
    };
  }

  if (!syncStatus.lastSyncAt) {
    const txSyncRes = await supabase
      .from("transactions")
      .select("created_at")
      .eq("business_id", businessId)
      .eq("source", "tiller")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (txSyncRes.error) throw new Error(txSyncRes.error.message);
    if (txSyncRes.data?.created_at) {
      syncStatus = {
        lastSyncAt: String(txSyncRes.data.created_at),
        status: "unknown",
        processedCount: null,
        message: "Latest imported Tiller transaction timestamp.",
      };
    }
  }

  return {
    accounts: resolvedAccounts,
    incomeThisMonth,
    expensesThisMonth,
    pendingReviewCount: pendingReviewCount ?? 0,
    unclearedCount: unclearedCount ?? 0,
    recentTransactions: (recent ?? []).map((t) => ({
      id: t.id,
      date: t.transaction_date,
      description: t.description,
      amount: Number(t.amount),
      account: (t.accounts as unknown as { name: string } | null)?.name ?? "",
      category: (t.categories as unknown as { name: string } | null)?.name ?? null,
      status: t.status,
    })),
    cashflowSeries: days,
    spendingByCategory,
    syncStatus,
  };
}
