"use client";
import { useEffect, useRef } from "react";

export function useTriageLink(connected: boolean, open: (mode: "extracted" | "normal" | "follow-up") => void) {
  const callback = useRef(open);
  useEffect(() => { callback.current = open; }, [open]);
  useEffect(() => {
    if (!connected) return;
    const activate = () => {
      const url = new URL(window.location.href);
      const mode = url.searchParams.get("triage");
      if (mode !== "extracted" && mode !== "normal" && mode !== "follow-up") return;
      url.searchParams.delete("triage");
      window.history.replaceState(window.history.state, "", url);
      callback.current(mode);
    };
    activate();
    window.addEventListener("popstate", activate);
    return () => window.removeEventListener("popstate", activate);
  }, [connected]);
}
