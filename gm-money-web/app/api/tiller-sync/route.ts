import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, getBusinessId } from "@/lib/supabase";
import { CUTOFF_DATE } from "@/lib/constants";

const SHARED_SECRET = process.env.TILLER_SYNC_SECRET;

// CUTOFF_DATE comes from lib/constants.ts (single source of truth, shared
// with the Dashboard/Register/Review), NOT a locally redeclared literal.
// It has to be enforced HERE, not just relied on via the Apps Script
// sender's lookback window -- the recurring 15-minute sync re-sends its
// whole window every run, so anything the sender includes for a date
// before this would otherwise silently repopulate the history that was
// deliberately purged for a clean slate (exactly what happened once
// already: a 60-day sender window quietly brought back 166 pre-cutoff
// rows within a couple of sync cycles).

type IncomingPayload = {
  accountName?: string;
  balance?: number;
  transactions?: Array<{
    date?: string;
    description?: string;
    amount?: number;
    category?: string;
    account?: string;
    source?: string;
  }>;
};

async function logSyncEvent(input: {
  businessId: string;
  status: "success" | "error";
  processedCount: number;
  errorMessage?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("sync_events").insert({
    business_id: input.businessId,
    source: "tiller_sync",
    status: input.status,
    processed_count: input.processedCount,
    error_message: input.errorMessage ?? null,
    received_at: new Date().toISOString(),
  });

  if (!error) return;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (text.includes("sync_events") && (text.includes("does not exist") || text.includes("42p01") || text.includes("pgrst"))) {
    return;
  }
  throw error;
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

// Supabase/PostgREST errors are plain objects (not `instanceof Error`), so
// `error instanceof Error ? error.message : "..."` silently swallows the
// real database error text -- exactly what was masking the actual "Spend"
// account failure as just "Sync failed".
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [maybe.message, maybe.details, maybe.hint].filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length > 0) {
      return maybe.code ? `[${maybe.code}] ${parts.join(" - ")}` : parts.join(" - ");
    }
  }
  return "Sync failed";
}

// Deterministic key so re-running a sync (the whole point of a recurring
// trigger) upserts the same real-world bank transaction instead of
// inserting a duplicate row every run -- same shape as the old app's
// `transaction_key` (date|description|amount|account), scoped by `source`
// via the unique index rather than folding source into the string itself.
function buildSourceRecordId(input: { date: string; description: string; amount: number; account: string }): string {
  const normalizedDescription = input.description.trim().toLowerCase();
  const normalizedAccount = input.account.trim().toLowerCase();
  return `${input.date}|${normalizedDescription}|${input.amount.toFixed(2)}|${normalizedAccount}`;
}

// Tiller has no stable per-transaction id to key off of, and its own
// reported date for a given purchase commonly shifts by a day or two
// between syncs (pending -> posted). Because that date is baked into
// source_record_id above, an exact-key upsert alone treats the shifted
// row as brand new instead of the same real-world transaction -- this is
// exactly the "same Afterpay charge showing twice with different
// categories" duplicate bug. Widen the match to account+description+
// amount within a short window so a date shift updates the existing row
// instead of inserting a second one.
const DUPLICATE_MATCH_WINDOW_DAYS = 5;

function shiftDateString(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const provided = request.headers.get("x-shared-secret") || request.nextUrl.searchParams.get("secret") || "";
  if (!SHARED_SECRET || provided !== SHARED_SECRET) {
    return unauthorized();
  }

  let payload: IncomingPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  try {
    const accountName = String(payload.accountName || "").trim();
    if (accountName) {
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .select("id")
        .eq("business_id", businessId)
        .eq("name", accountName)
        .maybeSingle();

      if (!accountError && account) {
        const balance = Number(payload.balance ?? 0);
        if (Number.isFinite(balance)) {
          const balanceDate = new Date().toISOString().slice(0, 10);

          // This table already had a pre-existing unique constraint on
          // (business_id, source, source_record_id) from the original
          // adopted schema. Leaving source_record_id null meant every
          // snapshot row shared the same (business_id, "tiller_sync",
          // null) key -- only the first account synced each run could
          // ever succeed, every account after it collided with that same
          // slot. Giving each account+day a real, distinct
          // source_record_id satisfies that existing constraint AND
          // doubles as the idempotency key a recurring sync needs.
          const { error: snapshotError } = await supabase
            .from("account_balance_snapshots")
            .upsert(
              {
                business_id: businessId,
                account_id: account.id,
                balance_date: balanceDate,
                balance,
                currency: "USD",
                source: "tiller_sync",
                source_record_id: `${account.id}|${balanceDate}`,
              },
              { onConflict: "business_id,source,source_record_id" },
            );
          if (snapshotError) throw snapshotError;
        }
      }
    }

    const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
    let accepted = 0;
    for (const tx of transactions) {
      const description = String(tx.description || "").trim();
      const amount = Number(tx.amount ?? 0);
      const date = String(tx.date || "").trim();
      if (!description || !Number.isFinite(amount) || !date) continue;
      if (date < CUTOFF_DATE) continue;

      const accountNameForTx = String(tx.account || payload.accountName || "").trim();
      let accountId: string | null = null;
      if (accountNameForTx) {
        const { data: account, error: accountError } = await supabase
          .from("accounts")
          .select("id")
          .eq("business_id", businessId)
          .eq("name", accountNameForTx)
          .maybeSingle();
        if (!accountError && account) accountId = account.id;
      }

      const source = tx.source || "tiller";
      const sourceRecordId = buildSourceRecordId({ date, description, amount, account: accountNameForTx });

      // Bank-fed rows are, by definition, already cleared -- Tiller only
      // reports transactions the bank has actually posted, never pending
      // authorizations. The old app hardcoded this the same way
      // (Register.gs's buildRegisterEntries_ always set status "Cleared"
      // for bank entries; only manual entries carry a real
      // Uncleared/Cleared distinction, resolved by matching them to their
      // bank counterpart -- see app/register/actions.ts's matchToBank).
      const rowPayload = {
        business_id: businessId,
        account_id: accountId,
        description,
        amount,
        transaction_date: date,
        status: "cleared",
        source,
        source_record_id: sourceRecordId,
        currency: "USD",
        updated_at: new Date().toISOString(),
      };

      // Look for an already-synced row for this same real-world
      // transaction whose date has since shifted (see
      // DUPLICATE_MATCH_WINDOW_DAYS above) before falling back to the
      // exact-key upsert. Matching by account_id (not just account name)
      // so this stays scoped correctly even when accountId couldn't be
      // resolved (accountId is null in that case and the query below
      // simply finds nothing, same as before).
      let existingId: string | null = null;
      if (accountId) {
        const { data: nearby, error: nearbyError } = await supabase
          .from("transactions")
          .select("id, description")
          .eq("business_id", businessId)
          .eq("account_id", accountId)
          .eq("source", source)
          .eq("amount", amount)
          .gte("transaction_date", shiftDateString(date, -DUPLICATE_MATCH_WINDOW_DAYS))
          .lte("transaction_date", shiftDateString(date, DUPLICATE_MATCH_WINDOW_DAYS));
        if (nearbyError) throw nearbyError;
        const match = (nearby ?? []).find(
          (row: { id: string; description: string }) =>
            row.description.trim().toLowerCase() === description.trim().toLowerCase(),
        );
        if (match) existingId = match.id;
      }

      if (existingId) {
        const { error: updateError } = await supabase.from("transactions").update(rowPayload).eq("id", existingId);
        if (updateError) throw updateError;
      } else {
        // Upsert on (business_id, source, source_record_id) as a fallback
        // for the exact-date-match case -- still needed so a sync re-run
        // with an unchanged date doesn't insert a fresh duplicate either.
        const { error: txError } = await supabase
          .from("transactions")
          .upsert(rowPayload, { onConflict: "business_id,source,source_record_id" });
        if (txError) throw txError;
      }
      accepted += 1;
    }

    await logSyncEvent({
      businessId,
      status: "success",
      processedCount: accepted,
    });

    return NextResponse.json({ ok: true, received: transactions.length });
  } catch (error) {
    const message = describeError(error);
    try {
      await logSyncEvent({
        businessId,
        status: "error",
        processedCount: 0,
        errorMessage: message,
      });
    } catch {
      // Sync should still return the original error even if telemetry logging fails.
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
