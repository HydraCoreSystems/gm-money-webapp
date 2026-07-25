import { getSupabaseServerClient, getBusinessId } from "./supabase";

export type CategoryOption = { id: string; name: string };
export type CategoryGroupOption = {
  type: "income" | "expense";
  categories: { id: string; name: string; subcategories: CategoryOption[] }[];
};

// The adopted schema stores category AND subcategory in one table via
// parent_id (a subcategory is just a row whose parent_id points at its
// category) -- this reshapes that into the same
// {type, categories: [{name, subcategories}]} grouping the rest of this
// project's UI (and the original app) already expects.
export async function getCategoryGroups(): Promise<CategoryGroupOption[]> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();

  const { data, error } = await supabase
    .from("categories")
    .select("id, parent_id, name, category_type, sort_order")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const topLevel = rows.filter((r) => !r.parent_id);
  const byParent = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.parent_id) continue;
    const list = byParent.get(r.parent_id) ?? [];
    list.push(r);
    byParent.set(r.parent_id, list);
  }

  const groups: Record<"income" | "expense", CategoryGroupOption["categories"]> = { income: [], expense: [] };
  for (const cat of topLevel) {
    const type = cat.category_type === "income" ? "income" : "expense";
    groups[type].push({
      id: cat.id,
      name: cat.name,
      subcategories: (byParent.get(cat.id) ?? []).map((s) => ({ id: s.id, name: s.name })),
    });
  }

  return [
    { type: "income", categories: groups.income },
    { type: "expense", categories: groups.expense },
  ];
}
