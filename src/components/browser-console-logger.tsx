"use client";

import * as React from "react";

type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";
type LogEntry = {
  timestamp: string;
  level: ConsoleLevel;
  flag: string;
  messages: string[];
};

const levels: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];
const explicitFlagPattern = /^\[([A-Z0-9][A-Z0-9:_-]{1,63})\]$/;
const flushDelayMs = 100;
const maxEntriesPerBatch = 100;

function isFrameworkRefreshMessage(data: unknown[]) {
  return typeof data[0] === "string"
    && (data[0] === "[Fast Refresh] rebuilding"
      || data[0].startsWith("[Fast Refresh] done in "));
}

function serialize(value: unknown) {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;

  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (typeof nestedValue === "object" && nestedValue !== null) {
        if (seen.has(nestedValue)) return "[Circular]";
        seen.add(nestedValue);
      }
      return nestedValue;
    });
  } catch {
    return String(value);
  }
}

export function BrowserConsoleLogger() {
  React.useEffect(() => {
    const pendingEntries: LogEntry[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const originals = Object.fromEntries(
      levels.map((level) => [level, console[level].bind(console)]),
    ) as Record<ConsoleLevel, (...data: unknown[]) => void>;

    const flush = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = undefined;
      if (pendingEntries.length === 0) return;

      while (pendingEntries.length > 0) {
        const entries = pendingEntries.splice(0, maxEntriesPerBatch);
        void fetch("/api/debug-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
          keepalive: true,
        }).catch(() => undefined);
      }
    };

    const scheduleFlush = () => {
      flushTimer ??= setTimeout(flush, flushDelayMs);
    };

    for (const level of levels) {
      console[level] = (...data: unknown[]) => {
        originals[level](...data);
        // Forwarding Next's refresh notices writes to the debug log, which can
        // itself wake the dev watcher and create a refresh/log feedback loop.
        if (isFrameworkRefreshMessage(data)) return;
        const explicitFlag =
          typeof data[0] === "string" ? data[0].match(explicitFlagPattern) : null;
        const flag = explicitFlag?.[1] ?? "GENERAL";
        const messages = explicitFlag ? data.slice(1) : data;
        pendingEntries.push({
          timestamp: new Date().toISOString(),
          level,
          flag,
          messages: messages.map(serialize),
        });
        scheduleFlush();
      };
    }

    window.addEventListener("pagehide", flush);

    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
      for (const level of levels) console[level] = originals[level];
    };
  }, []);

  return null;
}
