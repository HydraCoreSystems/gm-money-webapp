"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAppUser, getAppUserCount } from "@/lib/app-users";
import { createSessionToken, ENTERED_BY_COOKIE_NAME, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session";
import { requireEnv } from "@/lib/env";

export async function completeFirstTimeSetup(formData: FormData) {
  const displayName = String(formData.get("displayName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!displayName || !email || !password || !confirmPassword) {
    redirect("/setup?error=" + encodeURIComponent("Name, email, and password are required."));
  }

  if (password.length < 8) {
    redirect("/setup?error=" + encodeURIComponent("Password must be at least 8 characters."));
  }

  if (password !== confirmPassword) {
    redirect("/setup?error=" + encodeURIComponent("Password and confirmation do not match."));
  }

  const existingUsers = await getAppUserCount();
  if (existingUsers > 0) {
    redirect("/login?error=" + encodeURIComponent("Setup is already complete. Sign in."));
  }

  const user = await createAppUser({
    email,
    displayName,
    password,
    role: "owner",
  });

  const secret = requireEnv("AUTH_SECRET");
  const token = await createSessionToken(secret, {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  });

  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  cookieStore.set(ENTERED_BY_COOKIE_NAME, user.displayName || user.email, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect("/");
}
