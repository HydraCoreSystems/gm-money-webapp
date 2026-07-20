import type { ChangeEvent } from "react";
import type { CategoryGroup } from "../../api/types";

type Props = {
  groups: CategoryGroup[];
  category: string;
  subcategory: string;
  onChange: (next: { category: string; subcategory: string; type: "Income" | "Expense" }) => void;
};

export function CategoryPicker({ groups, category, subcategory, onChange }: Props) {
  const selectedGroup = groups.find((g) => g.categories.some((c) => c.name === category));
  const selectedCategory = selectedGroup?.categories.find((c) => c.name === category);

  function handleCategoryChange(e: ChangeEvent<HTMLSelectElement>) {
    const name = e.target.value;
    const group = groups.find((g) => g.categories.some((c) => c.name === name));
    if (!group) return;
    onChange({ category: name, subcategory: "", type: group.type });
  }

  function handleSubcategoryChange(e: ChangeEvent<HTMLSelectElement>) {
    if (!selectedGroup) return;
    onChange({ category, subcategory: e.target.value, type: selectedGroup.type });
  }

  return (
    <>
      <div className="gm-field">
        <label htmlFor="category">Category</label>
        <select id="category" value={category} onChange={handleCategoryChange} required>
          <option value="" disabled>
            Choose a category…
          </option>
          {groups.map((group) => (
            <optgroup key={group.type} label={group.type}>
              {group.categories.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {selectedCategory && selectedCategory.subcategories.length > 0 && (
        <div className="gm-field">
          <label htmlFor="subcategory">Subcategory</label>
          <select id="subcategory" value={subcategory} onChange={handleSubcategoryChange}>
            <option value="">(none)</option>
            {selectedCategory.subcategories.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
