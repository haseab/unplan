import assert from "node:assert/strict";
import test from "node:test";
import { EVENT_COLOR_PALETTE_ROWS } from "./event-color";
import { searchEventColors } from "./event-color-search";

const palette = EVENT_COLOR_PALETTE_ROWS.flatMap(row => row.options);

test("red finds red shades across the full palette ahead of unrelated colors", () => {
  const results = searchEventColors(palette, "red");
  assert.equal(results[0].name, "Scarlet");
  assert.ok(results.slice(0, 4).some(option => option.name === "Oxblood"));
  assert.ok(results.slice(0, 4).some(option => option.name === "Tomato"));
  assert.ok(!results.slice(0, 4).some(option => option.name === "Forest"));
  assert.ok(!results.some(option => ["Forest", "Violet", "White", "Navy"].includes(option.name)));
});
test("white only returns light neutral shades without padding unrelated colors", () => {
  const results = searchEventColors(palette, "white");
  assert.deepEqual(results.map(option => option.name), ["White", "Frost", "Graphite", "Silver"]);
});
test("common color searches stay within their visual family", () => {
  const families = {
    orange: ["Orange", "Tangerine", "Copper", "Umber"],
    yellow: ["Lemon", "Banana", "Gold", "Ochre"],
    blue: ["Azure", "Blueberry", "Lavender", "Navy"],
    purple: ["Violet", "Grape", "Plum", "Indigo"],
    pink: ["Rose", "Magenta", "Berry", "Wine"],
  };
  for (const [query, expected] of Object.entries(families)) {
    assert.deepEqual(searchEventColors(palette, query).map(option => option.name).sort(),
      [...expected].sort(), query);
    assert.equal(searchEventColors(palette, query)[0].name, expected[0], query);
  }
});
test("palette names and hex codes find their exact palette match first", () => {
  assert.equal(searchEventColors(palette, "Navy")[0].name, "Navy");
  assert.equal(searchEventColors(palette, "#244b89")[0].name, "Navy");
  assert.equal(searchEventColors(palette, "white")[0].name, "White");
});
test("blank, partial, and unknown queries have predictable results", () => {
  assert.deepEqual(searchEventColors(palette, "  "), palette);
  assert.ok(searchEventColors(palette, "deep").every(option => option.name === "Deep teal"));
  assert.deepEqual(searchEventColors(palette, "nonsense"), []);
});
