"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSessionToken, ENTERED_BY_COOKIE_NAME, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session";
import { requireEnv } from "@/lib/env";
import {
  findActiveUserByEmail,
  getAppUserCount,
  touchAppUserLastLogin,
  getLoginAttemptState,
  recordFailedLoginAttempt,
  clearLoginFailures,
} from "@/lib/app-users";
import bcrypt from "bcryptjs";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const userCount = await getAppUserCount();

  if (userCount === 0) {
    redirect("/setup");
  }

  if (!email || !password) {
    redirect("/login?error=" + encodeURIComponent("Email and password are required."));
  }

  const attemptState = await getLoginAttemptState(email);
  if (attemptState.lockedUntil && new Date(attemptState.lockedUntil).getTime() > Date.now()) {
    redirect("/login?error=" + encodeURIComponent("Too many failed attempts. Try again in a few minutes."));
  }

  const user = await findActiveUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await recordFailedLoginAttempt(email);
    redirect("/login?error=" + encodeURIComponent("Incorrect email or password."));
  }

  await clearLoginFailures(email);

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

  await touchAppUserLastLogin(user.id);

  redirect("/");
}

export async function logout() {
  const cookieStore = cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
