"use server";

import { revalidatePath } from "next/cache";
import {
  createScheduledTransaction,
  updateScheduledTransaction,
  deleteScheduledTransaction,
  processDueScheduledTransactions,
  validateScheduledAmountForCategory,
} from "@/lib/scheduled";

const REVALIDATE_PATHS = ["/", "/register", "/scheduled", "/dashboard"];

function revalidateScheduledRelatedPages() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

export async function createScheduled(formData: FormData) {
  const payee = String(formData.get("payee") || "").trim();
  const amount = Number(String(formData.get("amount") || ""));
  const accountId = String(formData.get("accountId") || "") || null;
  const parentCategoryId = String(formData.get("categoryId") || "") || null;
  const subcategoryId = String(formData.get("subcategoryId") || "") || null;
  const categoryId = subcategoryId || parentCategoryId;
  const paymentMethod = String(formData.get("paymentMethod") || "") || null;
  const frequency = String(formData.get("frequency") || "") || null;
  const nextDue = String(formData.get("nextDue") || "").trim();
  const occurrenceLimitText = String(formData.get("occurrenceLimit") || "").trim();
  const active = String(formData.get("active") || "false") === "true";
  const autoCreate = String(formData.get("autoCreate") || "false") === "true";
  const notes = String(formData.get("notes") || "").trim() || null;
  const occurrenceLimit = occurrenceLimitText ? Number(occurrenceLimitText) : null;

  if (!payee || !accountId || !nextDue || !Number.isFinite(amount)) {
    return { ok: false, error: "Payee, account, next due date, and a valid amount are required." };
  }

  if (occurrenceLimit !== null && (!Number.isInteger(occurrenceLimit) || occurrenceLimit <= 0)) {
    return { ok: false, error: "Number of payments must be a whole number greater than zero." };
  }

  const categoryValidation = await validateScheduledAmountForCategory({ categoryId, amount });
  if (!categoryValidation.ok) {
    return { ok: false, error: categoryValidation.error };
  }

  try {
    await createScheduledTransaction({
      payee,
      amount,
      accountId,
      categoryId,
      paymentMethod,
      frequency,
      nextDue,
      occurrenceLimit,
      active,
      autoCreate,
      notes,
    });
    await processDueScheduledTransactions();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save scheduled transaction." };
  }

  revalidateScheduledRelatedPages();
  return { ok: true };
}

export async function updateScheduled(id: string, formData: FormData) {
  const payee = String(formData.get("payee") || "").trim();
  const amount = Number(String(formData.get("amount") || ""));
  const accountId = String(formData.get("accountId") || "") || null;
  const parentCategoryId = String(formData.get("categoryId") || "") || null;
  const subcategoryId = String(formData.get("subcategoryId") || "") || null;
  const categoryId = subcategoryId || parentCategoryId;
  const paymentMethod = String(formData.get("paymentMethod") || "") || null;
  const frequency = String(formData.get("frequency") || "") || null;
  const nextDue = String(formData.get("nextDue") || "").trim();
  const occurrenceLimitText = String(formData.get("occurrenceLimit") || "").trim();
  const active = String(formData.get("active") || "false") === "true";
  const autoCreate = String(formData.get("autoCreate") || "false") === "true";
  const notes = String(formData.get("notes") || "").trim() || null;
  const occurrenceLimit = occurrenceLimitText ? Number(occurrenceLimitText) : null;

  if (!payee || !accountId || !nextDue || !Number.isFinite(amount)) {
    return { ok: false, error: "Payee, account, next due date, and a valid amount are required." };
  }

  if (occurrenceLimit !== null && (!Number.isInteger(occurrenceLimit) || occurrenceLimit <= 0)) {
    return { ok: false, error: "Number of payments must be a whole number greater than zero." };
  }

  const categoryValidation = await validateScheduledAmountForCategory({ categoryId, amount });
  if (!categoryValidation.ok) {
    return { ok: false, error: categoryValidation.error };
  }

  try {
    await updateScheduledTransaction(id, {
      payee,
      amount,
      accountId,
      categoryId,
      paymentMethod,
      frequency,
      nextDue,
      occurrenceLimit,
      active,
      autoCreate,
      notes,
    });
    await processDueScheduledTransactions();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update scheduled transaction." };
  }

  revalidateScheduledRelatedPages();
  return { ok: true };
}

export async function removeScheduled(id: string) {
  try {
    await deleteScheduledTransaction(id);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete scheduled transaction." };
  }

  revalidateScheduledRelatedPages();
  return { ok: true };
}

export async function runScheduledAutopostNow() {
  try {
    const stats = await processDueScheduledTransactions();
    revalidateScheduledRelatedPages();
    return { ok: true, stats };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not run scheduled autopost." };
  }
}
