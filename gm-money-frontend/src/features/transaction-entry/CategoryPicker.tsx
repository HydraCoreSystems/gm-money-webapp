import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CategoryGroup } from "../../api/types";

type Props = {
  groups: CategoryGroup[];
  category: string;
  subcategory: string;
  onChange: (next: { category: string; subcategory: string; type: "Income" | "Expense" }) => void;
};

export function CategoryPicker({ groups, category, subcategory, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedGroup = groups.find((g) => g.categories.some((c) => c.name === category));
  const selectedCategory = selectedGroup?.categories.find((c) => c.name === category);
  const derivedType = selectedGroup?.type;

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  function selectSubcategory(next: { category: string; subcategory: string; type: "Income" | "Expense" }) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;

    return groups
      .map((group) => ({
        ...group,
        categories: group.categories
          .map((cat) => {
            const categoryMatches = cat.name.toLowerCase().includes(q);
            const matchingSubs = cat.subcategories.filter((sub) => sub.toLowerCase().includes(q));
            if (categoryMatches) return cat;
            if (matchingSubs.length > 0) return { ...cat, subcategories: matchingSubs };
            return null;
          })
          .filter((cat): cat is CategoryGroup["categories"][number] => cat !== null),
      }))
      .filter((group) => group.categories.length > 0);
  }, [groups, query]);

  const displayLabel = !category
    ? null
    : selectedCategory && selectedCategory.subcategories.length > 0 && subcategory
      ? { category, subcategory }
      : { category, subcategory: "" };

  return (
    <div className="gm-category-picker" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className={open ? "gm-category-picker__display gm-category-picker__display--open" : "gm-category-picker__display"}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {displayLabel ? (
          <span className="gm-category-picker__chosen">
            <strong>{displayLabel.category}</strong>
            {displayLabel.subcategory && (
              <>
                <span>›</span>
                <strong>{displayLabel.subcategory}</strong>
              </>
            )}
          </span>
        ) : (
          <span className="gm-category-picker__placeholder">Choose a category…</span>
        )}
        {derivedType && (
          <span
            className={
              derivedType === "Income"
                ? "gm-category-picker__type-tag gm-category-picker__type-tag--income"
                : "gm-category-picker__type-tag"
            }
          >
            {derivedType}
          </span>
        )}
      </button>

      <p className="gm-category-picker__hint">
        Tap to change — grouped by Income and Expense, just like Money's category tree.
      </p>

      {open && (
        <div className="gm-category-picker__panel">
          <div className="gm-category-picker__search">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories or subcategories…"
            />
          </div>

          <div className="gm-category-picker__list" role="listbox">
            {filteredGroups.length === 0 && <p className="gm-category-picker__empty">No matches.</p>}

            {filteredGroups.map((group) => (
              <div key={group.type}>
                <div className="gm-category-picker__group-label">{group.type}</div>
                {group.categories.map((cat) =>
                  cat.subcategories.length === 0 ? (
                    <button
                      key={cat.name}
                      type="button"
                      className={
                        category === cat.name
                          ? "gm-category-picker__subcat gm-category-picker__subcat--category-only gm-category-picker__subcat--selected"
                          : "gm-category-picker__subcat gm-category-picker__subcat--category-only"
                      }
                      onClick={() => selectSubcategory({ category: cat.name, subcategory: "", type: group.type })}
                    >
                      {cat.name}
                    </button>
                  ) : (
                    <div key={cat.name}>
                      <div className="gm-category-picker__category-label">{cat.name}</div>
                      {cat.subcategories.map((sub) => {
                        const selected = category === cat.name && subcategory === sub;
                        return (
                          <button
                            key={sub}
                            type="button"
                            className={
                              selected
                                ? "gm-category-picker__subcat gm-category-picker__subcat--selected"
                                : "gm-category-picker__subcat"
                            }
                            onClick={() => selectSubcategory({ category: cat.name, subcategory: sub, type: group.type })}
                          >
                            <span className="gm-category-picker__check">{selected ? "✓" : ""}</span>
                            {sub}
                          </button>
                        );
                      })}
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
