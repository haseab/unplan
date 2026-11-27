"use client";
import { applyFrontendTheme } from "../runtime.js";

import { frontendStorage } from "../runtime.js";


import * as React from "react";
import {
  DEFAULT_THEME,
  isTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "../lib/theme.js";

const THEME_CHANGE_EVENT = "unplan:theme-change";

const readTheme = (): Theme => {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const savedTheme = frontendStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(savedTheme) ? savedTheme : DEFAULT_THEME;
};

const applyTheme = (theme: Theme) => {
  applyFrontendTheme(theme);
};

export function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>(DEFAULT_THEME);

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
    frontendStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
    setThemeState(nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return { theme, setTheme };
}
