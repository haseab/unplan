import test from "node:test";
import assert from "node:assert/strict";
import { selectAttentionAccounts, type AttentionCalendarAccount } from "./attention-calendar-accounts";

const work: AttentionCalendarAccount = { ownerId: "work-owner", id: "work", email: "haseab@f.inc", status: "active" };
const personal: AttentionCalendarAccount = { ownerId: "personal-owner", id: "personal", email: "hullah3000@gmail.com", status: "active" };

test("selects both accounts across separate owners and excludes unspecified connections", () => {
  assert.deepEqual(selectAttentionAccounts([work, personal, { ...work, email: "other@example.test" }], [" HASEAB@F.INC ", personal.email, work.email]), [work, personal]);
});
test("does not silently drop missing, expired or ambiguous accounts", () => {
  assert.throws(() => selectAttentionAccounts([work], [work.email, personal.email]));
  assert.throws(() => selectAttentionAccounts([work, { ...personal, status: "expired" }], [work.email, personal.email]));
  assert.throws(() => selectAttentionAccounts([work, { ...work, ownerId: "another-owner" }], [work.email]));
  assert.throws(() => selectAttentionAccounts([], []));
});

test("uses the unique Unplan sign-in containing both selected accounts", () => {
  const together = { ...personal, ownerId: work.ownerId };
  assert.deepEqual(selectAttentionAccounts([work, together, personal], [work.email, personal.email]), [work, together]);
  assert.throws(() => selectAttentionAccounts([work, together, personal, { ...work, ownerId: personal.ownerId }], [work.email, personal.email]));
});
