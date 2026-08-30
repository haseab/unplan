import assert from "node:assert/strict";
import test from "node:test";
import { buildTimeZoneGroups, timeZoneDisplayName } from "./time-zones";

test("groups the complete supported catalog by IANA region", () => {
  const groups = buildTimeZoneGroups("America/Los_Angeles", [
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
  ]);

  assert.deepEqual(groups, [
    { label: "Universal", zones: ["UTC"] },
    {
      label: "America",
      zones: ["America/Los_Angeles", "America/New_York"],
    },
    { label: "Europe", zones: ["Europe/London"] },
  ]);
});

test("keeps a current legacy zone even when the browser catalog omits it", () => {
  const groups = buildTimeZoneGroups("US/Pacific", ["America/Los_Angeles"]);

  assert.equal(
    groups.find(({ label }) => label === "US")?.zones.includes("US/Pacific"),
    true,
  );
});

test("formats IANA identifiers for display without changing their values", () => {
  assert.equal(timeZoneDisplayName("America/Argentina/Buenos_Aires"), "America/Argentina/Buenos Aires");
});
