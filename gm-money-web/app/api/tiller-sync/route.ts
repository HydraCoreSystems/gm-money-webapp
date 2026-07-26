import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, getBusinessId } from "@/lib/supabase";

const SHARED_SECRET = process.env.TILLER_SYNC_SECRET;

// Kept in sync with lib/dashboard.ts / lib/review.ts's CUTOFF_DATE. This
// has to be enforced HERE, not just relied on via the Apps Script sender's
// lookback window -- the recurring 15-minute sync re-sends its whole
// window every run, so anything the sender includes for a date before
// this would otherwise silently repopulate the history that was
// deliberately purged for a clean slate (exactly what happened once
// already: a 60-day sender window quietly brought back 166 pre-cutoff
// rows within a couple of sync cycles).
const CUTOFF_DATE = "2026-07-19";

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

      // Upsert on (business_id, source, source_record_id): the whole
      // point of a recurring sync is calling this endpoint repeatedly, and
      // Tiller has no concept of "only send new rows" -- without this,
      // every run would re-insert every transaction it's ever seen,
      // exactly the kind of duplicate-inflated-balance problem a manual
      // Register delete was just added to clean up.
      // Bank-fed rows are, by definition, already cleared -- Tiller only
      // reports transactions the bank has actually posted, never pending
      // authorizations. The old app hardcoded this the same way
      // (Register.gs's buildRegisterEntries_ always set status "Cleared"
      // for bank entries; only manual entries carry a real
      // Uncleared/Cleared distinction, resolved by matching them to their
      // bank counterpart -- see app/register/actions.ts's matchToBank).
      const { error: txError } = await supabase.from("transactions").upsert(
        {
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
        },
        { onConflict: "business_id,source,source_record_id" },
      );
      if (txError) throw txError;
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
