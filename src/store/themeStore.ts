import { create } from "zustand";

const STORAGE_KEY = "xcrowhub.theme";

type Theme = "dark" | "light";

function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "light"; // default
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  if (theme === "dark") {
    el.classList.add("dark");
  } else {
    el.classList.remove("dark");
  }
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: loadTheme(),

  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    applyTheme(next);
    set({ theme: next });
  },
}));

// Apply on import so the class is set before first render
applyTheme(loadTheme());
