"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCategory, createSubcategory } from "@/app/entry/actions";
import type { CategoryGroupOption } from "@/lib/categories";

type Selection = { categoryId: string; subcategoryId: string | null; type: "income" | "expense" };

type Props = {
  groups: CategoryGroupOption[];
  value: Selection | null;
  onChange: (next: Selection) => void;
  /** Hidden inputs so this picker's selection submits with a plain <form action={serverAction}>. */
  categoryFieldName: string;
  subcategoryFieldName: string;
  allowCreate?: boolean;
};

// Adapted from gm-money-frontend's nested Income/Expense picker -- same
// UI/interaction, but selects real category/subcategory ids (uuid) from
// the adopted schema instead of name strings.
export function CategoryPicker({ groups, value, onChange, categoryFieldName, subcategoryFieldName, allowCreate = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showSubcategoryForm, setShowSubcategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<"income" | "expense">("expense");
  const [subcategoryName, setSubcategoryName] = useState("");
  const [subcategoryParentId, setSubcategoryParentId] = useState("");
  const [toolMessage, setToolMessage] = useState("");
  const [toolError, setToolError] = useState("");
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

  const parentCategoryOptions = useMemo(
    () =>
      groups.flatMap((group) =>
        group.categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          type: group.type,
        })),
      ),
    [groups],
  );

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

  useEffect(() => {
    if (!allowCreate) return;
    if (subcategoryParentId || parentCategoryOptions.length === 0) return;
    setSubcategoryParentId(parentCategoryOptions[0].id);
  }, [allowCreate, parentCategoryOptions, subcategoryParentId]);

  function select(next: Selection) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  async function handleCreateCategory() {
    const name = categoryName.trim();
    if (!name) return;

    setToolError("");
    setToolMessage("");
    setIsSaving(true);
    const formData = new FormData();
    formData.set("name", name);
    formData.set("type", categoryType);
    const result = await createCategory(formData);
    setIsSaving(false);

    if (!result.ok) {
      setToolError(result.error || "Could not add category.");
      return;
    }

    setCategoryName("");
    setToolMessage(`Added category: ${result.category.name}`);
    onChange({ categoryId: result.category.id, subcategoryId: null, type: result.category.type });
    router.refresh();
  }

  async function handleCreateSubcategory() {
    const name = subcategoryName.trim();
    if (!name || !subcategoryParentId) return;

    setToolError("");
    setToolMessage("");
    setIsSaving(true);
    const formData = new FormData();
    formData.set("parentId", subcategoryParentId);
    formData.set("name", name);
    const result = await createSubcategory(formData);
    setIsSaving(false);

    if (!result.ok) {
      setToolError(result.error || "Could not add subcategory.");
      return;
    }

    setSubcategoryName("");
    setToolMessage(`Added subcategory: ${result.subcategory.name}`);
    onChange({
      categoryId: result.subcategory.parentId,
      subcategoryId: result.subcategory.id,
      type: result.subcategory.type,
    });
    router.refresh();
  }

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

            {allowCreate && (
              <div className="gm-category-picker__tools">
                <div className="gm-category-picker__tools-head">Quick add</div>

                {toolError && <p className="gm-error gm-category-picker__tool-status">{toolError}</p>}
                {toolMessage && <p className="gm-success gm-category-picker__tool-status">{toolMessage}</p>}

                <div className="gm-category-picker__tool-row">
                  <button type="button" className="gm-link-button" onClick={() => setShowCategoryForm((next) => !next)} disabled={isSaving}>
                    {showCategoryForm ? "Hide category form" : "+ Add category"}
                  </button>
                  {showCategoryForm && (
                    <div className="gm-category-picker__tool-form">
                      <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Category name" disabled={isSaving} />
                      <select value={categoryType} onChange={(e) => setCategoryType(e.target.value as "income" | "expense")} disabled={isSaving}>
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                      <button type="button" className="gm-link-button" disabled={isSaving || !categoryName.trim()} onClick={() => void handleCreateCategory()}>
                        Save
                      </button>
                    </div>
                  )}
                </div>

                <div className="gm-category-picker__tool-row">
                  <button type="button" className="gm-link-button" onClick={() => setShowSubcategoryForm((next) => !next)} disabled={isSaving || parentCategoryOptions.length === 0}>
                    {showSubcategoryForm ? "Hide subcategory form" : "+ Add subcategory"}
                  </button>
                  {showSubcategoryForm && (
                    <div className="gm-category-picker__tool-form">
                      <select value={subcategoryParentId} onChange={(e) => setSubcategoryParentId(e.target.value)} disabled={isSaving}>
                        {parentCategoryOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.type === "income" ? "Income" : "Expense"}: {option.name}
                          </option>
                        ))}
                      </select>
                      <input value={subcategoryName} onChange={(e) => setSubcategoryName(e.target.value)} placeholder="Subcategory name" disabled={isSaving} />
                      <button type="button" className="gm-link-button" disabled={isSaving || !subcategoryName.trim() || !subcategoryParentId} onClick={() => void handleCreateSubcategory()}>
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
