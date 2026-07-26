"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAppUser, setAppUserActive } from "@/lib/app-users";
import { requireUserRole, requireAuthenticatedUser } from "@/lib/auth-session";

function err(msg: string): never {
  redirect("/settings/users?error=" + encodeURIComponent(msg));
}

function ok(msg: string): never {
  redirect("/settings/users?success=" + encodeURIComponent(msg));
}

export async function addRegisteredUser(formData: FormData) {
  await requireUserRole(["owner", "admin"]);

  const displayName = String(formData.get("displayName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const roleRaw = String(formData.get("role") || "member").toLowerCase();
  const role = roleRaw === "owner" || roleRaw === "admin" ? roleRaw : "member";

  if (!displayName || !email || !password) {
    err("Name, email, and password are required.");
  }

  try {
    await createAppUser({ displayName, email, password, role });
  } catch (error) {
    err(error instanceof Error ? error.message : "Could not create user.");
  }

  revalidatePath("/settings/users");
  ok("User created.");
}

export async function deactivateRegisteredUser(formData: FormData) {
  const current = await requireAuthenticatedUser();
  await requireUserRole(["owner", "admin"]);

  const userId = String(formData.get("userId") || "").trim();
  if (!userId) {
    err("User id is required.");
  }

  if (current.userId === userId) {
    err("You cannot deactivate your own account.");
  }

  try {
    await setAppUserActive({ userId, active: false });
  } catch (error) {
    err(error instanceof Error ? error.message : "Could not deactivate user.");
  }

  revalidatePath("/settings/users");
  ok("User deactivated.");
}

export async function activateRegisteredUser(formData: FormData) {
  await requireUserRole(["owner", "admin"]);

  const userId = String(formData.get("userId") || "").trim();
  if (!userId) {
    err("User id is required.");
  }

  try {
    await setAppUserActive({ userId, active: true });
  } catch (error) {
    err(error instanceof Error ? error.message : "Could not activate user.");
  }

  revalidatePath("/settings/users");
  ok("User activated.");
}
