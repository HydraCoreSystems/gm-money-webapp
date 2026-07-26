// Signed session cookie using Web Crypto (crypto.subtle) rather than
// Node's `crypto` module, so the exact same code works in both the
// middleware (Edge Runtime, no Node crypto) and Server Actions (Node
// runtime, which also exposes crypto.subtle globally since Node 18) —
// one implementation instead of two runtime-specific ones. Ported
// verbatim from skrybix-webapp/lib/session.ts.

export const SESSION_COOKIE_NAME = "gm_money_session";
// Not security-sensitive -- just display attribution for who entered a
// transaction (Phil/Crystal), same purpose as the old sessionStorage
// "entered by" value. Deliberately not httpOnly so it stays simple to
// read from either a Server Component or client code if ever needed.
export const ENTERED_BY_COOKIE_NAME = "gm_money_entered_by";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type SessionClaims = {
  exp: number;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  role: "owner" | "admin" | "member" | null;
};

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function createSessionToken(
  secret: string,
  identity?: {
    userId?: string | null;
    email?: string | null;
    displayName?: string | null;
    role?: "owner" | "admin" | "member" | null;
  },
): Promise<string> {
  const payload = JSON.stringify({
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    userId: identity?.userId ?? null,
    email: identity?.email ?? null,
    displayName: identity?.displayName ?? null,
    role: identity?.role ?? null,
  });
  const payloadB64 = base64url(encoder.encode(payload));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${base64url(sig)}`;
}

export async function readSessionToken(secret: string, token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;

  const key = await getKey(secret);
  const sigBytes = base64urlToBytes(sigB64);
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes.buffer as ArrayBuffer, encoder.encode(payloadB64));
  if (!valid) return null;

  try {
    const payload = JSON.parse(decoder.decode(base64urlToBytes(payloadB64))) as {
      exp?: unknown;
      userId?: unknown;
      email?: unknown;
      displayName?: unknown;
      role?: unknown;
    };

    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    const roleRaw = String(payload.role ?? "").toLowerCase();
    const role = roleRaw === "owner" || roleRaw === "admin" || roleRaw === "member" ? roleRaw : null;

    return {
      exp: payload.exp,
      userId: typeof payload.userId === "string" && payload.userId.trim().length > 0 ? payload.userId : null,
      email: typeof payload.email === "string" && payload.email.trim().length > 0 ? payload.email : null,
      displayName:
        typeof payload.displayName === "string" && payload.displayName.trim().length > 0 ? payload.displayName : null,
      role,
    };
  } catch {
    return null;
  }
}

export async function verifySessionToken(secret: string, token: string | undefined | null): Promise<boolean> {
  const claims = await readSessionToken(secret, token);
  return claims !== null;
}

export { SESSION_MAX_AGE_SECONDS };
