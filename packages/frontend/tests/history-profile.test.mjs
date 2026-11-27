import test from 'node:test';
import assert from 'node:assert/strict';
import { configureFrontend } from '../dist/runtime.js';
import { eventHistoryShortcut, pastEventHistoryUrl } from '../dist/lib/event-history.js';
const key = { key: 'P', code: 'KeyP', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true, isComposing: false };
test('hosts preserve their existing timeline shortcuts while sharing one history implementation', () => {
  configureFrontend({});
  assert.equal(eventHistoryShortcut(key), null);
  assert.equal(eventHistoryShortcut({ ...key, altKey: true }), 'retrace');
  configureFrontend({ timelineHistory: { destination: 'project-three', altKey: false } });
  try {
    assert.equal(eventHistoryShortcut(key), 'project-three');
    assert.equal(eventHistoryShortcut({ ...key, altKey: true }), null);
    assert.match(pastEventHistoryUrl({ start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z' }, 'project-three'), /^project-threedev:/);
  } finally { configureFrontend({}); }
});
