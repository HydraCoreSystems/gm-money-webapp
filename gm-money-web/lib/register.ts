import { getSupabaseServerClient, getBusinessId } from "./supabase";
import { processDueScheduledTransactions } from "./scheduled";
import { CUTOFF_DATE } from "./constants";

// Applied only to the final displayed entries list, NOT to the underlying
// query or the running-balance walk below: those still need the complete
// history to anchor correctly off the real bank balance. Slicing the query
// itself would also silently drop the bank side of any manual/bank match
// pair that straddles the cutoff (a real entry hidden with no visible
// counterpart) -- filtering only the final list sidesteps that entirely.
// CUTOFF_DATE itself lives in lib/constants.ts (single source of truth,
// also used by the Dashboard, Review, and the Tiller-sync route).

type RawTransaction = {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
  status: string;
  source: string;
  category_id: string | null;
  payment_method: string | null;
  notes: string | null;
  categories: { name: string } | null;
};

export type MatchCandidate = {
  bankTransactionId: string;
  description: string;
  amount: number;
  date: string;
};

export type RegisterEntry = {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: string;
  source: string;
  category: string | null;
  // Leaf category id (a subcategory row if one is set, otherwise the
  // top-level category row) plus payment method/notes -- not needed for
  // the read-only display, only carried through so an edit form can be
  // pre-filled with the entry's real current values.
  categoryId: string | null;
  paymentMethod: string | null;
  notes: string | null;
  runningBalance: number;
  // Set only for an unmatched manual entry the heuristic below thinks
  // corresponds to a specific visible-elsewhere-hidden bank row -- lets
  // the UI offer "confirm this match" instead of leaving it stuck
  // Uncleared forever with no path to reconciliation.
  matchCandidate: MatchCandidate | null;
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

type DedupeResult = {
  visible: RawTransaction[];
  // Manual entries with an unconfirmed heuristic bank match -- the bank
  // row is already hidden below, but nothing has permanently recorded
  // the pairing yet, so the manual entry is still sitting Uncleared.
  candidateByManualId: Map<string, RawTransaction>;
};

// Dedup: a manual (sheet_manual) entry and its matching bank (tiller) row
// represent ONE real-world transaction -- the bank row must never also
// appear, exactly like the old app's "Matched Bank Key" rule. Uses
// explicit transaction_matches links first (authoritative), then a
// same-account/same-amount/within-7-days/shared-word heuristic for pairs
// nothing has explicitly matched yet.
function dedupe(rows: RawTransaction[], explicitBankIdsToHide: Set<string>, explicitlyMatchedManualIds: Set<string>): DedupeResult {
  const manual = rows.filter((r) => r.source === "sheet_manual");
  const bank = rows.filter((r) => r.source === "tiller");
  const hiddenBankIds = new Set(explicitBankIdsToHide);
  const candidateByManualId = new Map<string, RawTransaction>();

  for (const m of manual) {
    if (explicitlyMatchedManualIds.has(m.id)) continue; // already permanently reconciled
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
      candidateByManualId.set(m.id, b);
      break; // one bank row claimed per manual row
    }
  }

  return {
    visible: rows.filter((r) => !hiddenBankIds.has(r.id)),
    candidateByManualId,
  };
}

// Bank-fed rows are, by definition, already cleared (Tiller only reports
// transactions the bank actually posted). A manual entry is cleared once
// it's reconciled against its bank counterpart -- explicitly confirmed,
// not merely hidden by the heuristic above. Computed here rather than
// trusted from the stored column so this stays correct even if some other
// write path ever stores the wrong value.
function effectiveStatus(row: RawTransaction, explicitlyMatchedManualIds: Set<string>): string {
  if (row.source === "tiller") return "cleared";
  if (explicitlyMatchedManualIds.has(row.id)) return "cleared";
  return row.status;
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

  // These two ran concurrently via Promise.all() before -- confirmed live
  // (side-by-side against a raw fetch() to the identical endpoint in the
  // same execution) that firing two queries at once from the same
  // supabase-js client instance could silently return an empty result for
  // one of them, no error, nothing to catch. Sequential awaits below cost
  // one extra round trip but were confirmed to reliably return the real
  // data -- worth it for reconciliation state on real financial records.
  const { data: snapshot, error: snapshotError } = await supabase
    .from("account_balance_snapshots")
    .select("balance")
    .eq("account_id", account.id)
    .order("balance_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapshotError) throw new Error(snapshotError.message);

  const { data: matches, error: matchesError } = await supabase
    .from("transaction_matches")
    .select("manual_transaction_id, bank_transaction_id")
    .eq("business_id", businessId);
  if (matchesError) throw new Error(matchesError.message);

  // This is what the BANK currently confirms -- it does not yet reflect
  // anything you've entered that hasn't cleared. It's an anchor for the
  // per-row walk below, not what gets shown as "Current Balance" (see
  // adjustedBalance at the end of this function -- the owner was
  // explicit that a real Money-style register shows your true current
  // position, not just whatever the bank has gotten around to clearing).
  const rawBankBalance = Number(snapshot?.balance ?? 0);
  const explicitBankIdsToHide = new Set((matches ?? []).map((m) => m.bank_transaction_id as string));
  const explicitlyMatchedManualIds = new Set((matches ?? []).map((m) => m.manual_transaction_id as string));

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
      .select("id, transaction_date, description, amount, status, source, category_id, payment_method, notes, categories(name)")
      .eq("account_id", account.id)
      .order("transaction_date", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (txError) throw new Error(txError.message);
    rawRows.push(...((batch ?? []) as unknown as RawTransaction[]));
    if (!batch || batch.length < PAGE_SIZE) break;
  }

  const { visible, candidateByManualId } = dedupe(rawRows, explicitBankIdsToHide, explicitlyMatchedManualIds);

  // Anchor: the bank balance already reflects every cleared entry, so
  // walk backward first to find the balance *before* them, then forward
  // chronologically through everything (cleared and uncleared) so every
  // row gets a mathematically consistent running balance -- same
  // algorithm as the old app's Register.gs, not a naive running sum.
  const clearedSum = visible
    .filter((r) => effectiveStatus(r, explicitlyMatchedManualIds) === "cleared")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  let runningBalance = rawBankBalance - clearedSum;

  const entries: RegisterEntry[] = visible.map((r) => {
    runningBalance += Number(r.amount);
    const candidate = candidateByManualId.get(r.id);
    return {
      id: r.id,
      date: r.transaction_date,
      description: r.description,
      amount: Number(r.amount),
      status: effectiveStatus(r, explicitlyMatchedManualIds),
      source: r.source,
      category: r.categories?.name ?? null,
      categoryId: r.category_id,
      paymentMethod: r.payment_method,
      notes: r.notes,
      runningBalance,
      matchCandidate: candidate
        ? {
            bankTransactionId: candidate.id,
            description: candidate.description,
            amount: Number(candidate.amount),
            date: candidate.transaction_date,
          }
        : null,
    };
  });

  // After walking every entry, runningBalance = rawBankBalance - clearedSum
  // + sum(all entries) = rawBankBalance + unclearedSum -- your real
  // current position accounting for everything entered, cleared or not.
  // This, not the raw bank figure, is what "Current Balance" means here.
  const adjustedBalance = runningBalance;

  // Owner's explicit clean-slate request (2026-08-08, after the Tiller
  // duplicate-transaction bug muddied the older history): hide everything
  // before CUTOFF_DATE from what's displayed. currentBalance above is
  // already computed from the full walk, so this slice doesn't change it.
  const visibleEntries = entries.filter((e) => e.date >= CUTOFF_DATE);
  visibleEntries.reverse(); // most recent first, matching the old app's Register display order

  return {
    accountId: account.id,
    accountName: account.name,
    currentBalance: adjustedBalance,
    entries: visibleEntries,
  };
}

// Same adjusted-balance concept as getRegisterData's currentBalance, but
// without doing the full heuristic dedupe walk -- the Dashboard just
// needs the number for each account, not per-row match candidates.
// Mathematically exact, not an approximation: a manual entry is
// "uncleared" here under the identical rule getRegisterData's
// effectiveStatus() uses (explicitly matched, or already stored as
// cleared, counts as cleared; everything else counts as pending) --
// bank-fed rows are always cleared by definition so they never need to
// be summed in here at all.
export async function computeAdjustedAccountBalance(accountId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data: snapshot, error: snapshotError } = await supabase
    .from("account_balance_snapshots")
    .select("balance")
    .eq("account_id", accountId)
    .order("balance_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapshotError) throw new Error(snapshotError.message);
  const rawBankBalance = Number(snapshot?.balance ?? 0);

  const { data: matches, error: matchesError } = await supabase
    .from("transaction_matches")
    .select("manual_transaction_id")
    .eq("business_id", businessId);
  if (matchesError) throw new Error(matchesError.message);
  const matchedIds = new Set((matches ?? []).map((m) => m.manual_transaction_id as string));

  const PAGE_SIZE = 1000;
  let unclearedSum = 0;
  for (let page = 0; ; page++) {
    const { data: batch, error } = await supabase
      .from("transactions")
      .select("id, amount, status")
      .eq("account_id", accountId)
      .eq("source", "sheet_manual")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of batch ?? []) {
      const isCleared = matchedIds.has(row.id) || row.status === "cleared";
      if (!isCleared) unclearedSum += Number(row.amount);
    }
    if (!batch || batch.length < PAGE_SIZE) break;
  }

  return rawBankBalance + unclearedSum;
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
