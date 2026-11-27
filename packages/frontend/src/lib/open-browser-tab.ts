type BrowserTab = { opener: unknown; location: { replace: (href: string) => void } };
type OpenTab = (url: string, target: string) => BrowserTab | null;

export function openBrowserTab(
  href: string,
  openTab: OpenTab = (url, target) => window.open(url, target),
): boolean {
  try {
    if (!["http:", "https:"].includes(new URL(href).protocol)) return false;
  } catch { return false; }
  // Open a browser context first, outside any installed PWA URL scope. Navigate
  // that existing tab only after removing its access to the source window.
  const tab = openTab("about:blank", "_blank");
  if (!tab) return false;
  tab.opener = null;
  tab.location.replace(href);
  return true;
}
