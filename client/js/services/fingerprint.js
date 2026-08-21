/**
 * Deterministic transaction fingerprinting for duplicate prevention.
 *
 * Fingerprint format: SHA-256(accountId | date | signedAmount | normalizedPayee | occurrence)
 *
 * Design guarantees:
 *  - Debit (-$27.95) and refund (+$27.95) never collide (different signed amounts)
 *  - Two legitimate identical purchases on the same date get distinct occurrence numbers
 *  - Reimporting the same CSV produces identical occurrence sequences → all fingerprints
 *    already exist in DB → zero additional transactions
 */

export function buildBaseKey(accountId, date, amount, normalizedPayee) {
  return `${accountId}|${date}|${Number(amount).toFixed(2)}|${String(normalizedPayee).toUpperCase().trim()}`;
}

export async function generateFingerprint(accountId, date, amount, normalizedPayee, occurrence = 1) {
  const raw = `${buildBaseKey(accountId, date, amount, normalizedPayee)}|${occurrence}`;
  return await sha256(raw);
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
