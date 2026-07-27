"use client";

import { useEffect } from "react";

// Defensive safety net on top of layout.tsx's inline bootstrap script.
// Confirmed live that /scheduled (a heavy client-component page) could
// end up with no data-theme attribute at all despite localStorage
// correctly holding an explicit preference and the bootstrap script
// being present and byte-identical to pages where it worked -- and that
// manually re-applying the attribute after the page fully loads always
// stuck (nothing was actively fighting it after mount). This re-asserts
// the saved preference once React has actually mounted, which is a safe
// point after whatever pre-hydration issue was clearing it.
export function ThemeSync() {
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("gm-money-theme");
      const theme = saved === "light" || saved === "dark" ? saved : null;
      const current = document.documentElement.getAttribute("data-theme");
      if (theme && current !== theme) {
        document.documentElement.setAttribute("data-theme", theme);
      } else if (!theme && current) {
        document.documentElement.removeAttribute("data-theme");
      }
    } catch {
      // Non-fatal -- worst case the page falls back to the OS preference.
    }
  }, []);

  return null;
}
