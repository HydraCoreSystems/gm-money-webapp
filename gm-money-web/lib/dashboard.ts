import { getSupabaseServerClient, getBusinessId } from "./supabase";

// Per the owner's explicit instruction: nothing before this date should
// be considered "current" activity (2+ years of pre-existing history was
// migrated, but he only cares about this year going forward). This does
// NOT affect account balances (those are real point-in-time snapshots,
// unaffected by which transactions we choose to display).
const CUTOFF_DATE = "2026-07-01";

function startOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
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
};

export async function getDashboardData(): Promise<DashboardData> {
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
    .select("amount, categories(category_type)")
    .eq("business_id", businessId)
    .gte("transaction_date", startOfMonth());
  if (monthTxError) throw new Error(monthTxError.message);

  let incomeThisMonth = 0;
  let expensesThisMonth = 0;
  for (const t of monthTx ?? []) {
    const categoryType = (t.categories as unknown as { category_type: string } | null)?.category_type;
    const amount = Math.abs(Number(t.amount));
    if (categoryType === "income") incomeThisMonth += amount;
    else if (categoryType === "expense") expensesThisMonth += amount;
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
  };
}
