import { getSupabaseServerClient, getBusinessId } from "./supabase";

export type LiteAccountBalance = {
  id: string;
  name: string;
  balance: number;
};

// Deliberately minimal -- the full Dashboard query (lib/dashboard.ts)
// also computes month totals, a 30-day chart series, spending-by-category,
// and sync status, none of which the lite/mobile view needs. This is just
// "what's in each account right now," kept fast for a phone on a slow
// connection.
export async function getLiteBalances(): Promise<LiteAccountBalance[]> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const [{ data: accounts, error: accountsError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
    supabase.from("accounts").select("id, name, opening_balance").eq("business_id", businessId).eq("is_active", true).order("name"),
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

  return (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    balance: latestBalanceByAccount.get(a.id) ?? Number(a.opening_balance),
  }));
}
