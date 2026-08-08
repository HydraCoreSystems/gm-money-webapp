"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient, getBusinessId } from "@/lib/supabase";

export async function setBudget(formData: FormData) {
  const categoryId = String(formData.get("categoryId") || "").trim();
  const amountText = String(formData.get("amount") || "").trim();
  if (!categoryId) return { ok: false, error: "Category is required." };

  const amount = amountText ? Number(amountText) : null;
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) return { ok: false, error: "Budget amount must be a positive number." };

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data: existing, error: existingError } = await supabase
    .from("budgets")
    .select("id")
    .eq("business_id", businessId)
    .eq("category_id", categoryId)
    .maybeSingle();

  if (existingError) return { ok: false, error: existingError.message };

  if (existing) {
    const { error } = await supabase.from("budgets").update({ amount, updated_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("budgets").insert({ business_id: businessId, category_id: categoryId, amount, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteBudget(formData: FormData) {
  const categoryId = String(formData.get("categoryId") || "").trim();
  if (!categoryId) return { ok: false, error: "Category is required." };

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { error } = await supabase.from("budgets").delete().eq("business_id", businessId).eq("category_id", categoryId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}
