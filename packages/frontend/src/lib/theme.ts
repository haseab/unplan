export const THEME_STORAGE_KEY = "unplan_theme";
export const DEFAULT_THEME = "dark" as const;

export type Theme = "dark" | "light";

export const isTheme = (value: unknown): value is Theme =>
  value === "dark" || value === "light";

export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}})()`;
