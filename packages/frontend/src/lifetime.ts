import { useEffect, useLayoutEffect, useRef } from "react";
import { frontendHost } from "./runtime.js";
function useBrowserLifetimeCleanup(cleanup: () => void) {
  const latest = useRef(cleanup);
  useLayoutEffect(() => { latest.current = cleanup; }, [cleanup]);
  useEffect(() => () => latest.current(), []);
}
export function useFrontendLifetimeCleanup(cleanup: () => void) {
  // Host hooks are selected once at bootstrap and stay stable for the app lifetime.
  const useLifetimeCleanup = frontendHost().useLifetimeCleanup ?? useBrowserLifetimeCleanup;
  useLifetimeCleanup(cleanup);
}
