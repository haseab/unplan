import assert from "node:assert/strict";
import test from "node:test";
import { eventDescriptionContentType } from "./event-description-format";

test("recognizes Google Calendar HTML descriptions", () => {
  assert.equal(
    eventDescriptionContentType("<h2>Plan</h2><ul><li>First step</li></ul>"),
    "html",
  );
});

test("treats plain text and Markdown as Markdown", () => {
  assert.equal(eventDescriptionContentType("## Plan\n\n- First step"), "markdown");
  assert.equal(eventDescriptionContentType("Remember 2 < 3"), "markdown");
});
