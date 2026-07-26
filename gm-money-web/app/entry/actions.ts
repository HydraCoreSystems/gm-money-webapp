"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient, getBusinessId } from "@/lib/supabase";
import { cookies } from "next/headers";
import { ENTERED_BY_COOKIE_NAME } from "@/lib/session";
import { createScheduledTransaction, validateScheduledAmountForCategory } from "@/lib/scheduled";

export type CreateTransactionResult =
  | { ok: true; id: string; recurringCreated: boolean; recurringError?: string }
  | { ok: false; error: string };

const CATEGORY_REVALIDATE_PATHS = ["/", "/entry", "/register", "/review", "/scheduled", "/merchants", "/settings"];

function revalidateCategoryPages() {
  for (const path of CATEGORY_REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

export async function createCategory(
  formData: FormData,
): Promise<{ ok: true; category: { id: string; name: string; type: "income" | "expense" } } | { ok: false; error: string }> {
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "expense");

  if (!name) {
    return { ok: false, error: "Category name is required." };
  }

  if (type !== "income" && type !== "expense") {
    return { ok: false, error: "Category type is required." };
  }

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data: inserted, error } = await supabase
    .from("categories")
    .insert({
    business_id: businessId,
    name,
    category_type: type,
    is_active: true,
    sort_order: 1000,
    })
    .select("id, name, category_type")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateCategoryPages();
  return {
    ok: true,
    category: {
      id: inserted.id,
      name: inserted.name,
      type: inserted.category_type === "income" ? "income" : "expense",
    },
  };
}

export async function createSubcategory(
  formData: FormData,
): Promise<
  | { ok: true; subcategory: { id: string; name: string; parentId: string; type: "income" | "expense" } }
  | { ok: false; error: string }
> {
  const parentId = String(formData.get("parentId") || "").trim();
  const name = String(formData.get("name") || "").trim();

  if (!parentId || !name) {
    return { ok: false, error: "Parent category and subcategory name are required." };
  }

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data: parent, error: parentError } = await supabase
    .from("categories")
    .select("category_type")
    .eq("business_id", businessId)
    .eq("id", parentId)
    .maybeSingle();

  if (parentError) return { ok: false, error: parentError.message };
  if (!parent) return { ok: false, error: "Could not find that parent category." };

  const { data: inserted, error } = await supabase
    .from("categories")
    .insert({
    business_id: businessId,
    parent_id: parentId,
    name,
    category_type: parent.category_type,
    is_active: true,
    sort_order: 1000,
    })
    .select("id, name")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateCategoryPages();
  return {
    ok: true,
    subcategory: {
      id: inserted.id,
      name: inserted.name,
      parentId,
      type: parent.category_type === "income" ? "income" : "expense",
    },
  };
}

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
  const createRecurring = String(formData.get("createRecurring") || "false") === "true";
  const recurringFrequency = String(formData.get("recurringFrequency") || "Monthly").trim() || "Monthly";
  const recurringNextDue = String(formData.get("recurringNextDue") || date).trim() || date;
  const recurringLimitText = String(formData.get("recurringLimit") || "").trim();
  const recurringAutoCreate = String(formData.get("recurringAutoCreate") || "true") === "true";
  const recurringLimit = recurringLimitText ? Number(recurringLimitText) : null;

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

  if (createRecurring && recurringLimit !== null && (!Number.isInteger(recurringLimit) || recurringLimit <= 0)) {
    return { ok: false, error: "Recurring number of payments must be a whole number greater than zero." };
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

  let recurringCreated = false;
  let recurringError: string | undefined;
  if (createRecurring) {
    const recurringCategoryValidation = await validateScheduledAmountForCategory({
      categoryId: leafCategoryId,
      amount,
    });

    if (!recurringCategoryValidation.ok) {
      recurringError = recurringCategoryValidation.error;
    } else {
      try {
        await createScheduledTransaction({
          payee,
          amount,
          accountId,
          categoryId: leafCategoryId,
          paymentMethod,
          frequency: recurringFrequency,
          nextDue: recurringNextDue,
          occurrenceLimit: recurringLimit,
          active: true,
          autoCreate: recurringAutoCreate,
          notes,
        });
        recurringCreated = true;
      } catch (error) {
        recurringError = error instanceof Error ? error.message : "Could not create recurring schedule.";
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/register");
  if (createRecurring) {
    revalidatePath("/scheduled");
  }
  return { ok: true, id: inserted.id, recurringCreated, recurringError };
}
