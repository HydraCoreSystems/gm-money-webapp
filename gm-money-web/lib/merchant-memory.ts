import { getSupabaseServerClient, getBusinessId } from "./supabase";

export type MerchantMemoryStatus = "Locked" | "Auto-Ready" | "Learning";

export type MerchantMemoryRecord = {
  id: string;
  merchantKey: string;
  preferredName: string;
  categoryId: string;
  categoryName: string;
  subcategoryName: string | null;
  timesUsed: number;
  confidence: number;
  isLocked: boolean;
  status: MerchantMemoryStatus;
};

export type MerchantMemoryData = {
  records: MerchantMemoryRecord[];
  stats: {
    merchants: number;
    autoLearned: number;
    locked: number;
  };
};

function normalizeMerchantKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveLeafCategoryId(categoryId: string, subcategoryId: string | null): string {
  return subcategoryId || categoryId;
}

export async function getMerchantMemoryData(): Promise<MerchantMemoryData> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data, error } = await supabase
    .from("merchant_rules")
    .select("id, merchant_key, preferred_name, category_id, times_used, confidence, is_locked, created_at, updated_at")
    .eq("business_id", businessId)
    .order("preferred_name", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    merchant_key: string;
    preferred_name: string;
    category_id: string;
    times_used: number;
    confidence: number;
    is_locked: boolean;
  }>;

  const categoryIds = [...new Set(rows.map((row) => row.category_id))];
  let categoryMeta: Array<{ id: string; name: string; parent_id: string | null }> = [];

  if (categoryIds.length > 0) {
    const { data: categoryData, error: categoryError } = await supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("business_id", businessId)
      .in("id", categoryIds);

    if (categoryError) throw new Error(categoryError.message);
    categoryMeta = (categoryData ?? []) as Array<{ id: string; name: string; parent_id: string | null }>;
  }

  const byId = new Map(categoryMeta.map((row) => [row.id, row]));

  const records: MerchantMemoryRecord[] = rows.map((row) => {
    const category = byId.get(row.category_id);
    const status: MerchantMemoryStatus = row.is_locked ? "Locked" : row.confidence >= 70 ? "Auto-Ready" : "Learning";

    return {
      id: row.id,
      merchantKey: row.merchant_key,
      preferredName: row.preferred_name,
      categoryId: row.category_id,
      categoryName: category?.name ?? "Unassigned",
      subcategoryName: category?.parent_id ? category.name : null,
      timesUsed: Number(row.times_used ?? 0),
      confidence: Number(row.confidence ?? 0),
      isLocked: Boolean(row.is_locked),
      status,
    };
  });

  return {
    records,
    stats: {
      merchants: records.length,
      autoLearned: records.filter((r) => r.status === "Auto-Ready").length,
      locked: records.filter((r) => r.status === "Locked").length,
    },
  };
}

export async function saveMerchantRule(params: {
  merchantKey: string;
  preferredName: string;
  categoryId: string;
  subcategoryId: string | null;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const leafCategoryId = resolveLeafCategoryId(params.categoryId, params.subcategoryId);
  const now = new Date().toISOString();

  const { data: existing, error: lookupError } = await supabase
    .from("merchant_rules")
    .select("id, times_used, confidence, is_locked")
    .eq("business_id", businessId)
    .eq("merchant_key", params.merchantKey)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);

  const payload = {
    business_id: businessId,
    merchant_key: params.merchantKey,
    preferred_name: params.preferredName || params.merchantKey,
    category_id: leafCategoryId,
    times_used: existing?.times_used ?? 1,
    confidence: existing?.confidence ?? 70,
    is_locked: existing?.is_locked ?? false,
    first_seen_at: now,
    last_seen_at: now,
    created_at: now,
    updated_at: now,
  };

  if (existing) {
    const { error } = await supabase.from("merchant_rules").update(payload).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("merchant_rules").insert(payload);
    if (error) throw new Error(error.message);
  }
}

export async function setMerchantRuleLock(merchantKey: string, locked: boolean): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const { error } = await supabase.from("merchant_rules").update({ is_locked: locked, updated_at: new Date().toISOString() }).eq("business_id", businessId).eq("merchant_key", merchantKey);
  if (error) throw new Error(error.message);
}

export async function deleteMerchantRule(merchantKey: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const { error } = await supabase.from("merchant_rules").delete().eq("business_id", businessId).eq("merchant_key", merchantKey);
  if (error) throw new Error(error.message);
}

export async function rebuildMerchantRules(): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data, error } = await supabase
    .from("transactions")
    .select("id, description, category_id")
    .eq("business_id", businessId)
    .not("category_id", "is", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ description: string; category_id: string }>;
  const now = new Date().toISOString();

  for (const row of rows) {
    const merchantKey = normalizeMerchantKey(row.description);
    if (!merchantKey) continue;

    const { data: existing, error: lookupError } = await supabase
      .from("merchant_rules")
      .select("id, times_used, confidence, is_locked")
      .eq("business_id", businessId)
      .eq("merchant_key", merchantKey)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);

    const nextConfidence = existing ? Math.min(100, Number(existing.confidence ?? 0) + 12) : 70;
    const nextTimesUsed = (existing?.times_used ?? 0) + 1;

    const payload = {
      business_id: businessId,
      merchant_key: merchantKey,
      preferred_name: row.description.trim() || merchantKey,
      category_id: row.category_id,
      times_used: nextTimesUsed,
      confidence: nextConfidence,
      is_locked: existing?.is_locked ?? false,
      first_seen_at: existing ? undefined : now,
      last_seen_at: now,
      updated_at: now,
    };

    if (existing) {
      const { error } = await supabase.from("merchant_rules").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("merchant_rules").insert({ ...payload, created_at: now, first_seen_at: now });
      if (error) throw new Error(error.message);
    }
  }
}
