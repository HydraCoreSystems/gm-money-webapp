"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient, getBusinessId } from "@/lib/supabase";
import { resolveLeafCategoryId } from "@/lib/review";

export async function approveReviewTransaction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") || "").trim();
  const categoryId = String(formData.get("categoryId") || "").trim();
  const subcategoryId = String(formData.get("subcategoryId") || "").trim();
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!transactionId || !categoryId) {
    return { ok: false, error: "A transaction and category are required." };
  }

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const leafCategoryId = resolveLeafCategoryId(categoryId, subcategoryId || null);

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id, category_type")
    .eq("business_id", businessId)
    .eq("id", leafCategoryId)
    .single();

  if (categoryError || !category) {
    return { ok: false, error: "Could not resolve that category." };
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      category_id: leafCategoryId,
      review_status: "approved",
      notes,
      status: "uncleared",
    })
    .eq("id", transactionId)
    .eq("business_id", businessId)
    .eq("source", "tiller");

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/review");
  revalidatePath("/register");
  revalidatePath("/");
  return { ok: true };
}
