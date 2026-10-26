"use client";

import { useEffect } from "react";
import { useDb } from "@/lib/db/store";

/** Applies appearance settings (accent colour, theme, sidebar) to the page. */
export function useAppearance() {
  const db = useDb();
  const a = db?.settings.appearance;
  useEffect(() => {
    const root = document.documentElement;
    const accent = String(a?.accent ?? "#1769e8");
    root.style.setProperty("--blue", accent);
    const theme = String(a?.theme ?? "Light");
    const dark = theme === "Dark" || (theme === "System" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.sidebar = a?.compactSidebar ? "compact" : "full";
  }, [a]);
}
