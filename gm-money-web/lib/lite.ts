import { getSupabaseServerClient, getBusinessId } from "./supabase";
import { computeAdjustedAccountBalance } from "./register";

export type LiteAccountBalance = {
  id: string;
  name: string;
  balance: number;
};

// Deliberately minimal -- the full Dashboard query (lib/dashboard.ts)
// also computes month totals, a 30-day chart series, spending-by-category,
// and sync status, none of which the lite/mobile view needs. This is just
// "what's in each account right now," kept fast for a phone on a slow
// connection. Balance itself is still the real adjusted figure (bank
// balance + everything uncleared), same as Dashboard/Register -- Crystal
// entering a transaction from her phone needs to see the same true
// current position, not the bank's lagging cleared-only snapshot.
export async function getLiteBalances(): Promise<LiteAccountBalance[]> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, opening_balance")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (accountsError) throw new Error(accountsError.message);

  const balances: LiteAccountBalance[] = [];
  for (const a of accounts ?? []) {
    const balance = await computeAdjustedAccountBalance(a.id);
    balances.push({ id: a.id, name: a.name, balance });
  }
  return balances;
}
