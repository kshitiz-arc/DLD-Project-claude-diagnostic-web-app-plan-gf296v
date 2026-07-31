import { useCallback, useState } from "react";

type Theme = "system" | "light" | "dark";

/** Cycles the root data-theme so the viewer's toggle wins over the OS setting. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  const toggle = useCallback(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next: Exclude<Theme, "system"> =
      cur === "light" ? "dark" : cur === "dark" ? "light" : prefersDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setThemeState(next);
  }, []);

  return { theme, toggle };
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
