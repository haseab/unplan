"use client";

import * as React from "react";

type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

const levels: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];
const explicitFlagPattern = /^\[([A-Z0-9][A-Z0-9:_-]{1,63})\]$/;

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
    const originals = Object.fromEntries(
      levels.map((level) => [level, console[level].bind(console)]),
    ) as Record<ConsoleLevel, (...data: unknown[]) => void>;

    for (const level of levels) {
      console[level] = (...data: unknown[]) => {
        originals[level](...data);
        const explicitFlag =
          typeof data[0] === "string" ? data[0].match(explicitFlagPattern) : null;
        const flag = explicitFlag?.[1] ?? "GENERAL";
        const messages = explicitFlag ? data.slice(1) : data;
        void fetch("/api/debug-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level,
            flag,
            messages: messages.map(serialize),
          }),
          keepalive: true,
        }).catch(() => undefined);
      };
    }

    return () => {
      for (const level of levels) console[level] = originals[level];
    };
  }, []);

  return null;
}
