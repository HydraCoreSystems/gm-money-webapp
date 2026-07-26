import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, getBusinessId } from "@/lib/supabase";
import { processDueScheduledTransactions } from "@/lib/scheduled";

const SHARED_SECRET = process.env.CRON_SECRET;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const provided = request.headers.get("x-shared-secret") || request.nextUrl.searchParams.get("secret") || bearer || "";
  if (!SHARED_SECRET || provided !== SHARED_SECRET) {
    return unauthorized();
  }

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  try {
    const scheduled = await processDueScheduledTransactions();

    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("id")
      .eq("business_id", businessId)
      .eq("source", "tiller")
      .is("category_id", null)
      .order("transaction_date", { ascending: true })
      .limit(10);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      pendingReviewCount: transactions?.length ?? 0,
      scheduled,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Cron failed" }, { status: 500 });
  }
}
