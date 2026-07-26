import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";
import { SESSION_COOKIE_NAME, readSessionToken, type SessionClaims } from "@/lib/session";

export async function getSessionClaims(): Promise<SessionClaims | null> {
  const secret = requireEnv("AUTH_SECRET");
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  return readSessionToken(secret, token);
}

export async function requireAuthenticatedUser(): Promise<SessionClaims> {
  const claims = await getSessionClaims();
  if (!claims?.userId) {
    throw new Error("You are not signed in.");
  }
  return claims;
}

export async function requireUserRole(roles: Array<"owner" | "admin" | "member">): Promise<SessionClaims> {
  const claims = await requireAuthenticatedUser();
  if (!claims.role || !roles.includes(claims.role)) {
    throw new Error("You do not have permission for this action.");
  }
  return claims;
}
