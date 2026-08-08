// Constant-time comparison for machine-to-machine shared secrets
// (TILLER_SYNC_SECRET, CRON_SECRET). A plain `!==` short-circuits on the
// first differing byte, leaking how far the guess matched via response
// timing -- in principle enough to recover a secret character by
// character. Hashing both values with SHA-256 and comparing the digests
// in fixed time removes the length- and prefix-dependent timing signal.
// Web Crypto (crypto.subtle) is available in both the Edge and Node
// runtimes these route handlers run on (same pattern as lib/session.ts).
const encoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function constantTimeSecretEquals(provided: string, secret: string): Promise<boolean> {
  const [providedDigest, secretDigest] = await Promise.all([sha256Hex(provided), sha256Hex(secret)]);
  let diff = 0;
  for (let i = 0; i < providedDigest.length; i++) {
    diff |= providedDigest.charCodeAt(i) ^ secretDigest.charCodeAt(i);
  }
  return diff === 0;
}