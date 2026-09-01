import assert from "node:assert/strict";
import test from "node:test";
import { markdownLinkTokens } from "./markdown-links";

test("parses safe Markdown links while preserving surrounding title text", () => {
  assert.deepEqual(
    markdownLinkTokens("Review [the thread](https://example.com/thread) today"),
    [
      { text: "Review ", type: "text" },
      { href: "https://example.com/thread", text: "the thread", type: "link" },
      { text: " today", type: "text" },
    ],
  );
});

test("renders unsafe or malformed Markdown links as plain text", () => {
  assert.deepEqual(
    markdownLinkTokens("Open [this](javascript:alert)"),
    [
      { text: "Open ", type: "text" },
      { text: "[this](javascript:alert)", type: "text" },
    ],
  );
  assert.deepEqual(markdownLinkTokens("Keep [unfinished link"), [
    { text: "Keep [unfinished link", type: "text" },
  ]);
});
