"use server";

import { revalidatePath } from "next/cache";
import { addNotificationRecipient, removeNotificationRecipient, updateNotificationRecipient, type NotificationPrefs } from "@/lib/notifications";

export async function addRecipient(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();

  if (!email) return { ok: false, error: "An email address is required." };

  try {
    await addNotificationRecipient(name, email);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not add recipient." };
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function saveRecipient(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const prefsText = String(formData.get("prefs") || "");
  let prefs: NotificationPrefs;

  try {
    prefs = JSON.parse(prefsText) as NotificationPrefs;
  } catch {
    return { ok: false, error: "Invalid notification preferences." };
  }

  if (!email) return { ok: false, error: "Recipient email is required." };

  try {
    await updateNotificationRecipient(email, name, prefs);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update recipient." };
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteRecipient(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { ok: false, error: "Recipient email is required." };

  try {
    await removeNotificationRecipient(email);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not remove recipient." };
  }

  revalidatePath("/settings");
  return { ok: true };
}
