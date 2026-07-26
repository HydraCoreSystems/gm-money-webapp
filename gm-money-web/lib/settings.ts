import { getSupabaseServerClient, getBusinessId } from "./supabase";

export type SettingsBudget = {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number | null;
};

export type SettingsData = {
  categoryGroups: Array<{ type: "income" | "expense"; categories: Array<{ id: string; name: string; subcategories: Array<{ id: string; name: string }> }> }>;
  budgets: SettingsBudget[];
};

export async function getSettingsData(): Promise<SettingsData> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const [{ data: categoryRows, error: categoryError }, { data: budgetRows, error: budgetError }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, parent_id, name, category_type, sort_order")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("budgets").select("id, category_id, amount").eq("business_id", businessId).order("created_at", { ascending: false }),
  ]);

  if (categoryError) throw new Error(categoryError.message);
  if (budgetError) throw new Error(budgetError.message);

  const rows = (categoryRows ?? []) as Array<{ id: string; parent_id: string | null; name: string; category_type: string }>;
  const topLevel = rows.filter((row) => !row.parent_id);
  const byParent = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const list = byParent.get(row.parent_id) ?? [];
    list.push(row);
    byParent.set(row.parent_id, list);
  }

  const groups: Record<"income" | "expense", SettingsData["categoryGroups"][number]["categories"]> = {
    income: [],
    expense: [],
  };

  for (const category of topLevel) {
    const type = category.category_type === "income" ? "income" : "expense";
    groups[type].push({
      id: category.id,
      name: category.name,
      subcategories: (byParent.get(category.id) ?? []).map((sub) => ({ id: sub.id, name: sub.name })),
    });
  }

  const budgets: SettingsBudget[] = (budgetRows ?? []).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    categoryName: "",
    amount: row.amount != null ? Number(row.amount) : null,
  }));

  if (budgets.length > 0) {
    const categoryIds = [...new Set(budgets.map((budget) => budget.categoryId))];
    const { data: categoryMeta, error: categoryMetaError } = await supabase
      .from("categories")
      .select("id, name")
      .eq("business_id", businessId)
      .in("id", categoryIds);
    if (!categoryMetaError && categoryMeta) {
      const byId = new Map(categoryMeta.map((row) => [row.id, row.name]));
      for (const budget of budgets) {
        budget.categoryName = byId.get(budget.categoryId) ?? "";
      }
    }
  }

  return {
    categoryGroups: [
      { type: "income", categories: groups.income },
      { type: "expense", categories: groups.expense },
    ],
    budgets,
  };
}
