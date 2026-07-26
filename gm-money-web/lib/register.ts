import { getSupabaseServerClient, getBusinessId } from "./supabase";
import { processDueScheduledTransactions } from "./scheduled";

type RawTransaction = {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
  status: string;
  source: string;
  categories: { name: string } | null;
};

export type RegisterEntry = {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: string;
  source: string;
  category: string | null;
  runningBalance: number;
};

export type RegisterData = {
  accountId: string;
  accountName: string;
  currentBalance: number;
  entries: RegisterEntry[];
};

// Real payees don't match a bank's cryptic description exactly, so
// dedup needs more than just "same amount, close date" -- that alone
// produces false positives when two unrelated transactions happen to
// share an amount. Require the bank description to contain at least one
// meaningful (3+ letters) word from the manual payee too, matching the
// spirit of the old app's normalizeMerchantKey_-style matching without
// needing a full port of that exact algorithm.
function normalizedWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

function looksLikeSameMerchant(manualDescription: string, bankDescription: string): boolean {
  const manualWords = normalizedWords(manualDescription);
  const bankWords = new Set(normalizedWords(bankDescription));
  return manualWords.some((w) => bankWords.has(w));
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Dedup: a manual (sheet_manual) entry and its matching bank (tiller) row
// represent ONE real-world transaction -- the bank row must never also
// appear, exactly like the old app's "Matched Bank Key" rule. Uses
// explicit transaction_matches links first (authoritative), then a
// same-account/same-amount/within-2-days/shared-word heuristic for pairs
// the prior migration didn't explicitly record a match for.
function dedupe(rows: RawTransaction[], explicitBankIdsToHide: Set<string>): RawTransaction[] {
  const manual = rows.filter((r) => r.source === "sheet_manual");
  const bank = rows.filter((r) => r.source === "tiller");
  const hiddenBankIds = new Set(explicitBankIdsToHide);

  for (const m of manual) {
    if (hiddenBankIds.size === bank.length) break;
    const mTime = new Date(m.transaction_date).getTime();
    for (const b of bank) {
      if (hiddenBankIds.has(b.id)) continue;
      if (Number(b.amount) !== Number(m.amount)) continue;
      const bTime = new Date(b.transaction_date).getTime();
      // Real observed bank-posting lag in this data runs ~4 days between
      // a manual entry's date and Tiller's recorded date for the same
      // real purchase -- 7 days gives headroom without getting so wide
      // it risks merging genuinely different transactions.
      if (Math.abs(bTime - mTime) > 7 * DAY_MS) continue;
      if (!looksLikeSameMerchant(m.description, b.description)) continue;
      hiddenBankIds.add(b.id);
      break; // one bank row claimed per manual row
    }
  }

  return rows.filter((r) => !hiddenBankIds.has(r.id));
}

export async function getRegisterData(accountId?: string): Promise<RegisterData> {
  await processDueScheduledTransactions();

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (accountsError) throw new Error(accountsError.message);
  if (!accounts || accounts.length === 0) throw new Error("No active accounts found.");

  const account = accountId ? accounts.find((a) => a.id === accountId) ?? accounts[0] : accounts[0];

  const [{ data: snapshot, error: snapshotError }, { data: matches, error: matchesError }] = await Promise.all([
    supabase
      .from("account_balance_snapshots")
      .select("balance")
      .eq("account_id", account.id)
      .order("balance_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("transaction_matches").select("bank_transaction_id").eq("business_id", businessId),
  ]);
  if (snapshotError) throw new Error(snapshotError.message);
  if (matchesError) throw new Error(matchesError.message);

  const currentBalance = Number(snapshot?.balance ?? 0);
  const explicitBankIdsToHide = new Set((matches ?? []).map((m) => m.bank_transaction_id as string));

  // Full history is needed for a correct running balance (not just the
  // recent window shown elsewhere). PostgREST silently caps any single
  // request at its configured max-rows (1000 here) regardless of what
  // .range() asks for -- a single .range(0, 9999) call quietly returns
  // only the OLDEST 1000 rows, not an error, which is a real trap.
  // Paginate in pages of 1000 until a short page confirms we've reached
  // the end.
  const PAGE_SIZE = 1000;
  const rawRows: RawTransaction[] = [];
  for (let page = 0; ; page++) {
    const { data: batch, error: txError } = await supabase
      .from("transactions")
      .select("id, transaction_date, description, amount, status, source, categories(name)")
      .eq("account_id", account.id)
      .order("transaction_date", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (txError) throw new Error(txError.message);
    rawRows.push(...((batch ?? []) as unknown as RawTransaction[]));
    if (!batch || batch.length < PAGE_SIZE) break;
  }

  const deduped = dedupe(rawRows, explicitBankIdsToHide);

  // Anchor: the current balance already reflects every cleared entry, so
  // walk backward first to find the balance *before* them, then forward
  // chronologically through everything (cleared and uncleared) so every
  // row gets a mathematically consistent running balance -- same
  // algorithm as the old app's Register.gs, not a naive running sum.
  const clearedSum = deduped.filter((r) => r.status === "cleared").reduce((sum, r) => sum + Number(r.amount), 0);
  let runningBalance = currentBalance - clearedSum;

  const entries: RegisterEntry[] = deduped.map((r) => {
    runningBalance += Number(r.amount);
    return {
      id: r.id,
      date: r.transaction_date,
      description: r.description,
      amount: Number(r.amount),
      status: r.status,
      source: r.source,
      category: r.categories?.name ?? null,
      runningBalance,
    };
  });

  entries.reverse(); // most recent first, matching the old app's Register display order

  return {
    accountId: account.id,
    accountName: account.name,
    currentBalance,
    entries,
  };
}

export async function getActiveAccounts(): Promise<{ id: string; name: string }[]> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
