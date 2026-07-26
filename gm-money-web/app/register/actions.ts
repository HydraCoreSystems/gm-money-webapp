"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient, getBusinessId } from "@/lib/supabase";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export type DeleteTransactionResult = { ok: true } | { ok: false; error: string };

// Only manual entries can be deleted here -- bank-fed ('tiller') rows are
// the real record of what the bank actually did, and schedule-generated
// rows are recreated automatically by processDueScheduledTransactions(),
// so deleting either through this action would either desync from the
// bank or just come back next run. This is specifically for cleaning up
// stray manual entries that now duplicate a since-arrived bank
// transaction (the same purchase counted twice in the running balance).
export async function deleteManualTransaction(formData: FormData): Promise<DeleteTransactionResult> {
  await requireAuthenticatedUser();

  const id = String(formData.get("id") || "").trim();
  const accountId = String(formData.get("accountId") || "").trim();
  if (!id) {
    return { ok: false, error: "Missing transaction id." };
  }

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data: existing, error: lookupError } = await supabase
    .from("transactions")
    .select("id, source")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();

  if (lookupError) return { ok: false, error: lookupError.message };
  if (!existing) return { ok: false, error: "Transaction not found." };
  if (existing.source !== "sheet_manual") {
    return { ok: false, error: "Only manually-entered transactions can be deleted here." };
  }

  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("source", "sheet_manual");

  if (deleteError) return { ok: false, error: deleteError.message };

  revalidatePath("/");
  revalidatePath("/register");
  if (accountId) {
    revalidatePath(`/register?account=${accountId}`);
  }

  return { ok: true };
}
