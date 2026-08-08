import { getSupabaseServerClient, getBusinessId } from "./supabase";
import { CUTOFF_DATE } from "./constants";

export type PendingReviewTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  account: string;
};

export async function getReviewQueue(): Promise<PendingReviewTransaction[]> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data, error } = await supabase
    .from("transactions")
    .select("id, transaction_date, description, amount, accounts(name)")
    .eq("business_id", businessId)
    .eq("source", "tiller")
    .is("category_id", null)
    .gte("transaction_date", CUTOFF_DATE)
    .order("transaction_date", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    date: row.transaction_date,
    description: row.description,
    amount: Number(row.amount),
    account: (row.accounts as unknown as { name: string } | null)?.name ?? "",
  }));
}

export function resolveLeafCategoryId(categoryId: string, subcategoryId: string | null): string {
  return subcategoryId || categoryId;
}
