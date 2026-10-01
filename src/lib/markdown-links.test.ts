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


test("renders bare title URLs alongside Markdown links without trailing punctuation", () => {
  assert.deepEqual(markdownLinkTokens("See https://example.com/doc, then [Todoist](https://app.todoist.com/task/123)"), [
    { type: "text", text: "See " },
    { type: "link", text: "https://example.com/doc", href: "https://example.com/doc" },
    { type: "text", text: ", then " },
    { type: "link", text: "Todoist", href: "https://app.todoist.com/task/123" },
  ]);
  assert.deepEqual(markdownLinkTokens("(https://example.com/wiki/Plan_(work))."), [
    { type: "text", text: "(" },
    { type: "link", text: "https://example.com/wiki/Plan_(work)", href: "https://example.com/wiki/Plan_(work)" },
    { type: "text", text: ")." },
  ]);
});
