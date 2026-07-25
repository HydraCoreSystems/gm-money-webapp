import { useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "gm_money_theme";

export function getStoredTheme(): ThemeMode {
  const value = localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

function applyTheme(mode: ThemeMode) {
  if (mode === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", mode);
  }
}

export function setStoredTheme(mode: ThemeMode) {
  if (mode === "system") {
    localStorage.removeItem(THEME_KEY);
  } else {
    localStorage.setItem(THEME_KEY, mode);
  }
  applyTheme(mode);
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(getStoredTheme());

  function selectTheme(next: ThemeMode) {
    setStoredTheme(next);
    setMode(next);
  }

  return { mode, selectTheme };
}
