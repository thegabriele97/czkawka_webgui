import { useCallback, useEffect, useState } from "react";

export type Theme = "daylight" | "salvage";

// Per-device preference, deliberately in localStorage (confirmed with the
// owner): the theme is a personal display choice, not shared app state, so
// it's the one exception to the no-localStorage rule. The initial value is
// also applied by an inline script in index.html to avoid a flash.
const KEY = "czkawka-theme";

function readTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "daylight" || saved === "salvage") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "salvage" : "daylight";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "salvage" ? "daylight" : "salvage")), []);

  return { theme, toggle };
}
