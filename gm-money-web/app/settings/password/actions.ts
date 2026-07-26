"use server";

import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { updateAppUserPassword } from "@/lib/app-users";

export async function changePassword(formData: FormData) {
  const current = String(formData.get("current_password") || "");
  const next = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm_password") || "");

  if (next.length < 8) {
    redirect("/settings/password?error=" + encodeURIComponent("New password must be at least 8 characters."));
  }
  if (next !== confirm) {
    redirect("/settings/password?error=" + encodeURIComponent("New password and confirmation don't match."));
  }

  try {
    const claims = await requireAuthenticatedUser();
    await updateAppUserPassword({
      userId: claims.userId!,
      currentPassword: current,
      newPassword: next,
    });
  } catch (error) {
    redirect(
      "/settings/password?error=" +
        encodeURIComponent(error instanceof Error ? error.message : "Could not update password."),
    );
  }

  redirect("/settings/password?success=" + encodeURIComponent("Password updated."));
}
