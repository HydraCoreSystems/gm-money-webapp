"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CategoryGroupOption } from "@/lib/categories";

type Selection = { categoryId: string; subcategoryId: string | null; type: "income" | "expense" };

type Props = {
  groups: CategoryGroupOption[];
  value: Selection | null;
  onChange: (next: Selection) => void;
  /** Hidden inputs so this picker's selection submits with a plain <form action={serverAction}>. */
  categoryFieldName: string;
  subcategoryFieldName: string;
};

// Adapted from gm-money-frontend's nested Income/Expense picker -- same
// UI/interaction, but selects real category/subcategory ids (uuid) from
// the adopted schema instead of name strings.
export function CategoryPicker({ groups, value, onChange, categoryFieldName, subcategoryFieldName }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => {
    if (!value) return null;
    for (const group of groups) {
      for (const cat of group.categories) {
        if (value.subcategoryId) {
          const sub = cat.subcategories.find((s) => s.id === value.subcategoryId);
          if (sub && cat.id === value.categoryId) return { categoryName: cat.name, subName: sub.name, type: group.type };
        } else if (cat.id === value.categoryId) {
          return { categoryName: cat.name, subName: null, type: group.type };
        }
      }
    }
    return null;
  }, [value, groups]);

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

  function select(next: Selection) {
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
            const matchingSubs = cat.subcategories.filter((s) => s.name.toLowerCase().includes(q));
            if (categoryMatches) return cat;
            if (matchingSubs.length > 0) return { ...cat, subcategories: matchingSubs };
            return null;
          })
          .filter((c): c is CategoryGroupOption["categories"][number] => c !== null),
      }))
      .filter((g) => g.categories.length > 0);
  }, [groups, query]);

  return (
    <div className="gm-category-picker" ref={rootRef}>
      <input type="hidden" name={categoryFieldName} value={value?.categoryId ?? ""} />
      <input type="hidden" name={subcategoryFieldName} value={value?.subcategoryId ?? ""} />

      <button
        type="button"
        className={open ? "gm-category-picker__display gm-category-picker__display--open" : "gm-category-picker__display"}
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <span className="gm-category-picker__chosen">
            <strong>{selected.categoryName}</strong>
            {selected.subName && (
              <>
                <span>›</span>
                <strong>{selected.subName}</strong>
              </>
            )}
          </span>
        ) : (
          <span className="gm-category-picker__placeholder">Choose a category…</span>
        )}
        {selected && (
          <span
            className={
              selected.type === "income"
                ? "gm-category-picker__type-tag gm-category-picker__type-tag--income"
                : "gm-category-picker__type-tag"
            }
          >
            {selected.type}
          </span>
        )}
      </button>

      {open && (
        <div className="gm-category-picker__panel">
          <div className="gm-category-picker__search">
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories…" />
          </div>
          <div className="gm-category-picker__list">
            {filteredGroups.length === 0 && <p className="gm-category-picker__empty">No matches.</p>}
            {filteredGroups.map((group) => (
              <div key={group.type}>
                <div className="gm-category-picker__group-label">{group.type}</div>
                {group.categories.map((cat) =>
                  cat.subcategories.length === 0 ? (
                    <button
                      key={cat.id}
                      type="button"
                      className={
                        value?.categoryId === cat.id
                          ? "gm-category-picker__subcat gm-category-picker__subcat--category-only gm-category-picker__subcat--selected"
                          : "gm-category-picker__subcat gm-category-picker__subcat--category-only"
                      }
                      onClick={() => select({ categoryId: cat.id, subcategoryId: null, type: group.type })}
                    >
                      {cat.name}
                    </button>
                  ) : (
                    <div key={cat.id}>
                      <div className="gm-category-picker__category-label">{cat.name}</div>
                      {cat.subcategories.map((sub) => {
                        const isSelected = value?.categoryId === cat.id && value?.subcategoryId === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            className={
                              isSelected
                                ? "gm-category-picker__subcat gm-category-picker__subcat--selected"
                                : "gm-category-picker__subcat"
                            }
                            onClick={() => select({ categoryId: cat.id, subcategoryId: sub.id, type: group.type })}
                          >
                            <span className="gm-category-picker__check">{isSelected ? "✓" : ""}</span>
                            {sub.name}
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
