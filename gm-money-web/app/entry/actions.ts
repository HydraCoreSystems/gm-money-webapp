"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient, getBusinessId } from "@/lib/supabase";
import { cookies } from "next/headers";
import { ENTERED_BY_COOKIE_NAME } from "@/lib/session";

export type CreateTransactionResult = { ok: true; id: string } | { ok: false; error: string };

// Category is the ONLY thing that determines Income vs Expense -- never a
// client-supplied field. The category's type is looked up server-side and
// used purely to validate the entered amount's sign is consistent with it
// (matching the old app's buildTransactionValues_ invariant); the actual
// signed amount typed by the user is stored as-is, same convention this
// schema already uses (negative = expense, positive = income).
export async function createTransaction(formData: FormData): Promise<CreateTransactionResult> {
  const date = String(formData.get("date") || "");
  const accountId = String(formData.get("accountId") || "");
  const payee = String(formData.get("payee") || "").trim();
  const amountText = String(formData.get("amount") || "");
  const categoryId = String(formData.get("categoryId") || "");
  // This schema has no separate subcategory_id column -- subcategories
  // are just category rows with parent_id set, so a chosen subcategory
  // IS the leaf category_id to store (more specific than its parent).
  const subcategoryId = String(formData.get("subcategoryId") || "") || null;
  const leafCategoryId = subcategoryId || categoryId;
  const paymentMethod = String(formData.get("paymentMethod") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!date || !accountId || !payee || !amountText || !categoryId) {
    return { ok: false, error: "Date, account, payee, amount, and category are all required." };
  }

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("category_type")
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

  const enteredBy = cookies().get(ENTERED_BY_COOKIE_NAME)?.value || null;

  const { data: inserted, error: insertError } = await supabase
    .from("transactions")
    .insert({
      business_id: businessId,
      account_id: accountId,
      category_id: leafCategoryId,
      transaction_date: date,
      description: payee,
      amount,
      currency: "USD",
      status: "uncleared",
      source: "sheet_manual",
      payment_method: paymentMethod,
      notes,
      review_status: "approved", // manual entries are categorized at entry time, unlike bank-fed rows awaiting Review
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message || "Could not save the transaction." };
  }

  revalidatePath("/");
  revalidatePath("/register");
  return { ok: true, id: inserted.id };
}
