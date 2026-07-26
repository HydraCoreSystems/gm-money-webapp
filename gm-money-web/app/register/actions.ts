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

export type MatchTransactionResult = { ok: true } | { ok: false; error: string };

// Reconciliation: confirms that a manual entry and a bank-fed transaction
// are the same real-world event. Records the link permanently
// (transaction_matches, same as the old app's "Matched Bank Key") and
// marks the manual entry Cleared -- bank-fed rows are already always
// treated as cleared (see lib/register.ts's effectiveStatus), so this is
// the only place a manual entry ever becomes Cleared.
export async function matchToBank(formData: FormData): Promise<MatchTransactionResult> {
  await requireAuthenticatedUser();

  const manualId = String(formData.get("manualId") || "").trim();
  const bankId = String(formData.get("bankId") || "").trim();
  const accountId = String(formData.get("accountId") || "").trim();
  if (!manualId || !bankId) {
    return { ok: false, error: "Missing transaction ids." };
  }

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data: rows, error: lookupError } = await supabase
    .from("transactions")
    .select("id, source")
    .eq("business_id", businessId)
    .in("id", [manualId, bankId]);

  if (lookupError) return { ok: false, error: lookupError.message };

  const manualRow = rows?.find((r) => r.id === manualId);
  const bankRow = rows?.find((r) => r.id === bankId);
  if (!manualRow || manualRow.source !== "sheet_manual") {
    return { ok: false, error: "Not a valid manual entry." };
  }
  if (!bankRow || bankRow.source !== "tiller") {
    return { ok: false, error: "Not a valid bank transaction." };
  }

  const { error: matchError } = await supabase.from("transaction_matches").insert({
    business_id: businessId,
    manual_transaction_id: manualId,
    bank_transaction_id: bankId,
    match_method: "manual_confirm",
    confidence: 100,
    matched_at: new Date().toISOString(),
  });
  if (matchError) return { ok: false, error: matchError.message };

  const { error: updateError } = await supabase
    .from("transactions")
    .update({ status: "cleared", reconciled_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", manualId);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath("/");
  revalidatePath("/register");
  if (accountId) {
    revalidatePath(`/register?account=${accountId}`);
  }

  return { ok: true };
}
