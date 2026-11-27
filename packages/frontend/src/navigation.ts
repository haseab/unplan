import { useMemo } from "react";
import { frontendHost } from "./runtime.js";
function useBrowserNavigation() {
  return useMemo(() => ({
    replace(path: string) { window.location.replace(path); },
    refresh() { window.location.reload(); },
  }), []);
}
export function useRouter() {
  const useNavigation = frontendHost().useNavigation ?? useBrowserNavigation;
  return useNavigation();
}
