"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getPasswordHash } from "@/lib/site-auth-db";
import { createSessionToken, ENTERED_BY_COOKIE_NAME, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

export async function login(formData: FormData) {
  const password = String(formData.get("password") || "");
  const enteredBy = String(formData.get("enteredBy") || "");
  const hash = await getPasswordHash();

  if (!hash || !(await bcrypt.compare(password, hash))) {
    redirect("/login?error=" + encodeURIComponent("Incorrect password."));
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");

  const token = await createSessionToken(secret);
  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  if (enteredBy) {
    cookieStore.set(ENTERED_BY_COOKIE_NAME, enteredBy, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }

  redirect("/");
}

export async function logout() {
  const cookieStore = cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
