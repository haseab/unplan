"use client";

import * as React from "react";
import {
  DEFAULT_THEME,
  isTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";

const THEME_CHANGE_EVENT = "unplan:theme-change";

const readTheme = (): Theme => {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(savedTheme) ? savedTheme : DEFAULT_THEME;
};

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
};

export function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>(readTheme);

  React.useEffect(() => {
    const updateTheme = () => {
      const nextTheme = readTheme();
      applyTheme(nextTheme);
      setThemeState(nextTheme);
    };

    updateTheme();
    window.addEventListener("storage", updateTheme);
    window.addEventListener(THEME_CHANGE_EVENT, updateTheme);
    return () => {
      window.removeEventListener("storage", updateTheme);
      window.removeEventListener(THEME_CHANGE_EVENT, updateTheme);
    };
  }, []);

  const setTheme = React.useCallback((nextTheme: Theme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
    setThemeState(nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return { theme, setTheme };
}
