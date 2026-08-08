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

export type UpdateTransactionResult = { ok: true } | { ok: false; error: string };

// Lets a manual entry be corrected in place -- e.g. a mistyped dollar
// amount -- instead of the only prior option (delete the wrong entry,
// re-enter it from scratch). Same category/sign invariant as
// createTransaction (app/entry/actions.ts): the category alone determines
// Income/Expense, never a client-supplied flag, and the two must always
// agree. Bank-fed and schedule-generated rows aren't editable here for the
// same reasons they aren't deletable here (see deleteManualTransaction).
export async function updateManualTransaction(formData: FormData): Promise<UpdateTransactionResult> {
  await requireAuthenticatedUser();

  const id = String(formData.get("id") || "").trim();
  const accountId = String(formData.get("accountId") || "").trim();
  const date = String(formData.get("date") || "");
  const payee = String(formData.get("payee") || "").trim();
  const amountText = String(formData.get("amount") || "");
  const categoryId = String(formData.get("categoryId") || "");
  const subcategoryId = String(formData.get("subcategoryId") || "") || null;
  const leafCategoryId = subcategoryId || categoryId;
  const paymentMethod = String(formData.get("paymentMethod") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!id || !date || !payee || !amountText || !categoryId) {
    return { ok: false, error: "Date, payee, amount, and category are all required." };
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
    return { ok: false, error: "Only manually-entered transactions can be edited here." };
  }

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("category_type")
    .eq("business_id", businessId)
    .eq("id", leafCategoryId)
    .single();
  if (categoryError || !category) {
    return { ok: false, error: "Could not look up that category's type." };
  }

  const amount = Number(amountText);
  if (!isFinite(amount) || amount === 0) {
    return { ok: false, error: "Amount must be a non-zero number." };
  }
  const expectedSign = category.category_type === "income" ? 1 : -1;
  if (Math.sign(amount) !== expectedSign) {
    return {
      ok: false,
      error: `That category is ${category.category_type}, so the amount should be ${expectedSign > 0 ? "positive" : "negative"}.`,
    };
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      transaction_date: date,
      description: payee,
      amount,
      category_id: leafCategoryId,
      payment_method: paymentMethod,
      notes,
    })
    .eq("business_id", businessId)
    .eq("id", id)
    .eq("source", "sheet_manual");
  if (updateError) return { ok: false, error: updateError.message };

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

  // Guard against double-linking: either side of a match must be unused,
  // otherwise two manual entries could both get marked cleared against the
  // same real bank amount, double-counting it in the register's running
  // balance. A unique constraint on transaction_matches backs this up at
  // the DB layer too, but check here first for a clean error message.
  const { data: existingMatches, error: existingMatchError } = await supabase
    .from("transaction_matches")
    .select("manual_transaction_id, bank_transaction_id")
    .eq("business_id", businessId)
    .or(`manual_transaction_id.eq.${manualId},bank_transaction_id.eq.${bankId}`);
  if (existingMatchError) return { ok: false, error: existingMatchError.message };
  if (existingMatches && existingMatches.length > 0) {
    return { ok: false, error: "One of these transactions is already matched to something else." };
  }

  const { error: matchError } = await supabase.from("transaction_matches").insert({
    business_id: businessId,
    manual_transaction_id: manualId,
    bank_transaction_id: bankId,
    // "manual_confirm" seemed like the obvious value but the pre-existing
    // check constraint on this column (from the originally-adopted
    // schema) rejects it -- confirmed empirically that "manual" is
    // accepted, since the constraint's actual allowed list isn't exposed
    // anywhere queryable (PostgREST doesn't surface check constraint
    // definitions, and the table had no surviving rows left to infer
    // from).
    match_method: "manual",
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
