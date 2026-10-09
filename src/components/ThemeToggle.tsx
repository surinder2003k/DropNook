"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

const STORAGE_KEY = "dropnook-theme";

/**
 * ThemeToggle — light/dark switch for the header.
 *
 * The initial class is applied by an inline script in layout.tsx before first
 * paint (no flash). This component only mirrors that already-applied class to
 * pick the icon and flips the class + persists the choice on click.
 */
export default function ThemeToggle() {
  // null until mounted → defaults to the moon (light) icon server-side and
  // avoids a hydration mismatch with the class the layout script applied.
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Deferred out of the synchronous effect body (react-hooks/set-state-in-effect)
    // — just reads the class the layout script already set.
    queueMicrotask(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    const root = document.documentElement;
    root.classList.toggle("dark", next);
    root.classList.toggle("light", !next);
    root.style.colorScheme = next ? "dark" : "light";
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* private mode — ignore, the class change still applies */
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light mode" : "Dark mode"}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:border-indigo-500/50 dark:hover:text-indigo-400"
    >
      {dark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </button>
  );
}
