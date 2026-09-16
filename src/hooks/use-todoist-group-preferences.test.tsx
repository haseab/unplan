import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { useTodoistCustomGroups, useTodoistGroupPreferences } from "./use-todoist-group-preferences";

function FolderPreferences() {
  const [groups] = useTodoistCustomGroups();
  const { collapsedGroups, groupOrder, groupParents } = useTodoistGroupPreferences();
  return <pre>{JSON.stringify({ groups, collapsedGroups: [...collapsedGroups], groupOrder, groupParents })}</pre>;
}

test("initial folder markup matches with and without browser storage", () => {
  const serverMarkup = renderToString(<FolderPreferences />);
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let reads = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          reads += 1;
          return key.includes("parents")
            ? JSON.stringify({ Work: "Priority" })
            : JSON.stringify(["Priority", "Work"]);
        },
      },
    },
  });
  try {
    assert.equal(renderToString(<FolderPreferences />), serverMarkup);
    assert.equal(reads, 0, "saved folders must only be read after hydration");
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
