"use server";

import { revalidatePath } from "next/cache";
import { deleteMerchantRule, rebuildMerchantRules, saveMerchantRule, setMerchantRuleLock, type MerchantMemoryStatus } from "@/lib/merchant-memory";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function updateMerchantMemory(formData: FormData) {
  await requireAuthenticatedUser();

  const merchantKey = String(formData.get("merchantKey") || "").trim();
  const preferredName = String(formData.get("preferredName") || "").trim();
  const categoryId = String(formData.get("categoryId") || "").trim();
  const subcategoryId = String(formData.get("subcategoryId") || "").trim();

  if (!merchantKey || !categoryId) {
    return { ok: false, error: "A merchant and a category are required." };
  }

  try {
    await saveMerchantRule({ merchantKey, preferredName, categoryId, subcategoryId: subcategoryId || null });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save merchant memory." };
  }

  revalidatePath("/merchants");
  return { ok: true };
}

export async function toggleMerchantLock(formData: FormData) {
  await requireAuthenticatedUser();

  const merchantKey = String(formData.get("merchantKey") || "").trim();
  const locked = String(formData.get("locked") || "false") === "true";

  if (!merchantKey) {
    return { ok: false, error: "Merchant was not provided." };
  }

  try {
    await setMerchantRuleLock(merchantKey, locked);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update merchant lock." };
  }

  revalidatePath("/merchants");
  return { ok: true };
}

export async function removeMerchantMemory(formData: FormData) {
  await requireAuthenticatedUser();

  const merchantKey = String(formData.get("merchantKey") || "").trim();
  if (!merchantKey) {
    return { ok: false, error: "Merchant was not provided." };
  }

  try {
    await deleteMerchantRule(merchantKey);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete merchant memory." };
  }

  revalidatePath("/merchants");
  return { ok: true };
}

export async function rebuildMerchantMemory() {
  await requireAuthenticatedUser();

  try {
    await rebuildMerchantRules();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not rebuild merchant memory." };
  }

  revalidatePath("/merchants");
  return { ok: true };
}
