import { getSupabaseServerClient, getBusinessId } from "./supabase";

export type ScheduledTransaction = {
  id: string;
  payee: string;
  amount: number;
  accountId: string | null;
  account: string;
  categoryId: string | null;
  categoryName: string | null;
  paymentMethod: string | null;
  frequency: string | null;
  nextDue: string;
  occurrenceLimit: number | null;
  occurrencesGenerated: number;
  lastGeneratedDue: string | null;
  completedAt: string | null;
  active: boolean;
  autoCreate: boolean;
  notes: string | null;
};

export type ScheduledAutoPostResult = {
  processedSchedules: number;
  createdTransactions: number;
  completedSchedules: number;
  skippedSchedules: number;
  errors: string[];
};

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addMonthsClamped(dateKey: string, months: number): string {
  const from = parseDateKey(dateKey);
  const day = from.getDate();
  const targetMonthIndex = from.getMonth() + months;
  const targetYear = from.getFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedTargetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const clampedDay = Math.min(day, lastDayOfMonth(targetYear, normalizedTargetMonth));
  return toDateKey(new Date(targetYear, normalizedTargetMonth, clampedDay));
}

function normalizeFrequency(frequency: string | null | undefined): string {
  return String(frequency || "monthly").trim().toLowerCase().replace(/\s+/g, "");
}

function advanceDueDate(dueDate: string, frequency: string | null): string {
  const normalized = normalizeFrequency(frequency);
  if (normalized === "daily") {
    const next = parseDateKey(dueDate);
    next.setDate(next.getDate() + 1);
    return toDateKey(next);
  }
  if (normalized === "weekly") {
    const next = parseDateKey(dueDate);
    next.setDate(next.getDate() + 7);
    return toDateKey(next);
  }
  if (normalized === "every2weeks" || normalized === "everytwoweeks" || normalized === "biweekly") {
    const next = parseDateKey(dueDate);
    next.setDate(next.getDate() + 14);
    return toDateKey(next);
  }
  if (normalized === "quarterly") {
    return addMonthsClamped(dueDate, 3);
  }
  if (normalized === "yearly" || normalized === "annually") {
    return addMonthsClamped(dueDate, 12);
  }
  return addMonthsClamped(dueDate, 1);
}

export async function validateScheduledAmountForCategory(input: {
  categoryId: string | null;
  amount: number;
}): Promise<{ ok: true; leafCategoryId: string; categoryType: "income" | "expense" } | { ok: false; error: string }> {
  const leafCategoryId = input.categoryId;
  if (!leafCategoryId) {
    return { ok: false, error: "Category is required for scheduled auto-posting." };
  }

  if (!Number.isFinite(input.amount) || input.amount === 0) {
    return { ok: false, error: "Amount must be a non-zero number." };
  }

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const { data: category, error } = await supabase
    .from("categories")
    .select("category_type")
    .eq("business_id", businessId)
    .eq("id", leafCategoryId)
    .maybeSingle();
  if (error || !category) {
    return { ok: false, error: "Could not look up scheduled category type." };
  }

  const categoryType = category.category_type === "income" ? "income" : "expense";
  const expectedSign = categoryType === "income" ? 1 : -1;
  if (Math.sign(input.amount) !== expectedSign) {
    return {
      ok: false,
      error: `That category is ${categoryType}, so the scheduled amount should be ${expectedSign > 0 ? "positive" : "negative"}.`,
    };
  }

  return { ok: true, leafCategoryId, categoryType };
}

export async function processDueScheduledTransactions(todayDate = toDateKey(new Date())): Promise<ScheduledAutoPostResult> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data: dueRows, error: dueError } = await supabase
    .from("recurring_transactions")
    .select(
      "id, account_id, payee, amount, category_id, payment_method, frequency, next_due, is_active, auto_create, notes, occurrence_limit, occurrences_generated, last_generated_due, completed_at",
    )
    .eq("business_id", businessId)
    .eq("is_active", true)
    .eq("auto_create", true)
    .lte("next_due", todayDate)
    .order("next_due", { ascending: true });
  if (dueError) throw new Error(dueError.message);

  const result: ScheduledAutoPostResult = {
    processedSchedules: 0,
    createdTransactions: 0,
    completedSchedules: 0,
    skippedSchedules: 0,
    errors: [],
  };

  const rows = dueRows ?? [];
  if (rows.length === 0) return result;

  const leafIds = [...new Set(rows.map((row) => row.category_id).filter(Boolean))] as string[];
  const categoryTypeById = new Map<string, "income" | "expense">();
  if (leafIds.length > 0) {
    const { data: categories, error: categoryError } = await supabase
      .from("categories")
      .select("id, category_type")
      .eq("business_id", businessId)
      .in("id", leafIds);
    if (categoryError) throw new Error(categoryError.message);
    for (const category of categories ?? []) {
      categoryTypeById.set(category.id, category.category_type === "income" ? "income" : "expense");
    }
  }

  for (const row of rows) {
    result.processedSchedules += 1;
    const leafCategoryId = row.category_id as string | null;
    if (!leafCategoryId) {
      result.skippedSchedules += 1;
      result.errors.push(`Skipped ${row.payee}: no category selected.`);
      continue;
    }

    const categoryType = categoryTypeById.get(leafCategoryId);
    if (!categoryType) {
      result.skippedSchedules += 1;
      result.errors.push(`Skipped ${row.payee}: category not found.`);
      continue;
    }

    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      result.skippedSchedules += 1;
      result.errors.push(`Skipped ${row.payee}: invalid amount.`);
      continue;
    }

    const expectedSign = categoryType === "income" ? 1 : -1;
    if (Math.sign(amount) !== expectedSign) {
      result.skippedSchedules += 1;
      result.errors.push(`Skipped ${row.payee}: amount sign does not match ${categoryType} category.`);
      continue;
    }

    let nextDue = String(row.next_due);
    let occurrencesGenerated = Number(row.occurrences_generated ?? 0);
    const occurrenceLimit = row.occurrence_limit == null ? null : Number(row.occurrence_limit);
    let lastGeneratedDue = (row.last_generated_due as string | null) ?? null;
    let completedAt = (row.completed_at as string | null) ?? null;
    let updated = false;

    for (let loop = 0; loop < 180 && nextDue <= todayDate; loop++) {
      if (occurrenceLimit !== null && occurrencesGenerated >= occurrenceLimit) {
        break;
      }

      const { data: existing, error: existingError } = await supabase
        .from("transactions")
        .select("id")
        .eq("business_id", businessId)
        .eq("schedule_id", row.id)
        .eq("transaction_date", nextDue)
        .limit(1)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);

      if (!existing) {
        const now = new Date().toISOString();
        const { error: createError } = await supabase.from("transactions").insert({
          business_id: businessId,
          account_id: row.account_id,
          category_id: leafCategoryId,
          transaction_date: nextDue,
          description: row.payee,
          amount,
          currency: "USD",
          status: "uncleared",
          source: "schedule_auto",
          // Same pre-existing NULLS NOT DISTINCT constraint that broke
          // manual Entry inserts (see app/entry/actions.ts) applies here
          // too, scoped to source='schedule_auto' -- without this, only
          // the first auto-posted recurring transaction would ever
          // succeed; every one after it would silently fail the cron.
          source_record_id: crypto.randomUUID(),
          payment_method: row.payment_method,
          notes: row.notes,
          review_status: "approved",
          schedule_id: row.id,
          created_at: now,
          updated_at: now,
        });
        if (createError) throw new Error(createError.message);
        result.createdTransactions += 1;
      }

      occurrencesGenerated += 1;
      lastGeneratedDue = nextDue;
      const advanced = advanceDueDate(nextDue, row.frequency);
      nextDue = advanced <= nextDue ? toDateKey(new Date(parseDateKey(nextDue).getTime() + 24 * 60 * 60 * 1000)) : advanced;
      updated = true;
    }

    const shouldComplete = occurrenceLimit !== null && occurrencesGenerated >= occurrenceLimit;
    if (shouldComplete) {
      completedAt = completedAt ?? new Date().toISOString();
      result.completedSchedules += 1;
      updated = true;
    }

    if (updated) {
      const { error: updateError } = await supabase
        .from("recurring_transactions")
        .update({
          next_due: nextDue,
          occurrences_generated: occurrencesGenerated,
          last_generated_due: lastGeneratedDue,
          is_active: shouldComplete ? false : row.is_active,
          completed_at: shouldComplete ? completedAt : null,
          updated_at: new Date().toISOString(),
        })
        .eq("business_id", businessId)
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
    }
  }

  return result;
}

export async function getScheduledTransactions(): Promise<ScheduledTransaction[]> {
  await processDueScheduledTransactions();

  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data, error } = await supabase
    .from("recurring_transactions")
    .select(
      "id, payee, amount, account_id, category_id, payment_method, frequency, next_due, is_active, auto_create, notes, occurrence_limit, occurrences_generated, last_generated_due, completed_at",
    )
    .eq("business_id", businessId)
    .order("next_due", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const accountIds = [...new Set(rows.map((row) => row.account_id).filter(Boolean))] as string[];
  const categoryIds = rows.map((row) => row.category_id).filter(Boolean);
  const accountLookup = new Map<string, string>();
  const categoryLookup = new Map<string, string>();

  if (accountIds.length > 0) {
    const { data: accountRows, error: accountError } = await supabase
      .from("accounts")
      .select("id, name")
      .eq("business_id", businessId)
      .in("id", accountIds);
    if (!accountError && accountRows) {
      for (const account of accountRows) accountLookup.set(account.id, account.name);
    }
  }

  if (categoryIds.length > 0) {
    const { data: categories, error: categoryError } = await supabase
      .from("categories")
      .select("id, name")
      .eq("business_id", businessId)
      .in("id", categoryIds);
    if (!categoryError && categories) {
      for (const category of categories) categoryLookup.set(category.id, category.name);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    payee: row.payee,
    amount: Number(row.amount),
    accountId: row.account_id ?? null,
    account: row.account_id ? accountLookup.get(row.account_id) ?? "Unknown account" : "No account",
    categoryId: row.category_id ?? null,
    categoryName: row.category_id ? categoryLookup.get(row.category_id) ?? null : null,
    paymentMethod: row.payment_method ?? null,
    frequency: row.frequency ?? null,
    nextDue: row.next_due,
    occurrenceLimit: row.occurrence_limit == null ? null : Number(row.occurrence_limit),
    occurrencesGenerated: Number(row.occurrences_generated ?? 0),
    lastGeneratedDue: row.last_generated_due ?? null,
    completedAt: row.completed_at ?? null,
    active: Boolean(row.is_active),
    autoCreate: Boolean(row.auto_create),
    notes: row.notes ?? null,
  }));
}

async function assertAccountBelongsToBusiness(accountId: string | null, businessId: string): Promise<void> {
  if (!accountId) return;
  const supabase = getSupabaseServerClient();
  const { data: account, error } = await supabase
    .from("accounts")
    .select("id")
    .eq("business_id", businessId)
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!account) throw new Error("Could not find that account.");
}

export async function createScheduledTransaction(input: {
  payee: string;
  amount: number;
  accountId: string | null;
  categoryId: string | null;
  paymentMethod: string | null;
  frequency: string | null;
  nextDue: string;
  occurrenceLimit: number | null;
  active: boolean;
  autoCreate: boolean;
  notes: string | null;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  await assertAccountBelongsToBusiness(input.accountId, businessId);
  const { error } = await supabase.from("recurring_transactions").insert({
    business_id: businessId,
    account_id: input.accountId,
    category_id: input.categoryId,
    payee: input.payee,
    amount: input.amount,
    payment_method: input.paymentMethod,
    frequency: input.frequency,
    next_due: input.nextDue,
    is_active: input.active,
    auto_create: input.autoCreate,
    occurrence_limit: input.occurrenceLimit,
    occurrences_generated: 0,
    last_generated_due: null,
    completed_at: null,
    notes: input.notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
}

export async function updateScheduledTransaction(id: string, input: {
  payee: string;
  amount: number;
  accountId: string | null;
  categoryId: string | null;
  paymentMethod: string | null;
  frequency: string | null;
  nextDue: string;
  occurrenceLimit: number | null;
  active: boolean;
  autoCreate: boolean;
  notes: string | null;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  await assertAccountBelongsToBusiness(input.accountId, businessId);
  const { error } = await supabase.from("recurring_transactions").update({
    payee: input.payee,
    amount: input.amount,
    account_id: input.accountId,
    category_id: input.categoryId,
    payment_method: input.paymentMethod,
    frequency: input.frequency,
    next_due: input.nextDue,
    occurrence_limit: input.occurrenceLimit,
    completed_at: input.active ? null : new Date().toISOString(),
    is_active: input.active,
    auto_create: input.autoCreate,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("business_id", businessId);

  if (error) throw new Error(error.message);
}

export async function deleteScheduledTransaction(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const { error } = await supabase.from("recurring_transactions").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw new Error(error.message);
}
