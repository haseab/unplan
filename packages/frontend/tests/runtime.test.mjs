import test from 'node:test';
import assert from 'node:assert/strict';
import { panelCoordinates, configureFrontend, frontendFetch, frontendStorage, frontendDocument, addScopedKeyListener, removeScopedKeyListener } from '../dist/runtime.js';

test('host transport preserves in-flight ownership and leaves global fetch untouched', async () => {
  const original = globalThis.fetch;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const seen = [];
  configureFrontend({ request: async (input, init) => { seen.push([input, init.method]); await pending; return new Response('first'); } });
  const save = frontendFetch('/api/example', { method: 'POST' });
  configureFrontend({ request: async () => new Response('second') });
  finish();
  assert.equal(await (await save).text(), 'first');
  assert.equal(await (await frontendFetch('/api/example')).text(), 'second');
  assert.deepEqual(seen, [['/api/example', 'POST']]);
  assert.equal(globalThis.fetch, original);
  configureFrontend({});
});

test('host preference mapping preserves existing keys without moving or clearing unrelated data', () => {
  const original = globalThis.window;
  const values = new Map([['embedded:position', 'existing'], ['unrelated', 'keep']]);
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  try {
    configureFrontend({ preferenceKey: key => key === 'position' ? 'embedded:position' : key });
    assert.equal(frontendStorage.getItem('position'), 'existing');
    frontendStorage.setItem('position', 'updated');
    assert.equal(values.get('embedded:position'), 'updated');
    assert.equal(values.get('unrelated'), 'keep');
    assert.throws(() => frontendStorage.clear());
    configureFrontend({});
    assert.equal(frontendStorage.getItem('position'), null);
  } finally { globalThis.window = original; configureFrontend({}); }
});

test('embedded keyboard ownership is scoped, deduplicated, and released', () => {
  const original = globalThis.Element;
  class Element extends EventTarget { constructor(inside) { super(); this.inside = inside; } closest() { return this.inside ? this : null; } }
  globalThis.Element = Element;
  const target = new EventTarget(); let calls = 0;
  const listener = () => calls++;
  const dispatch = inside => { const event = new Event('keydown'); Object.defineProperty(event, 'target', { value: new Element(inside) }); target.dispatchEvent(event); };
  try {
    configureFrontend({ rootSelector: '.embedded' });
    addScopedKeyListener(target, listener, true); addScopedKeyListener(target, listener, true);
    dispatch(false); assert.equal(calls, 0);
    dispatch(true); assert.equal(calls, 1);
    removeScopedKeyListener(target, listener, true);
    dispatch(true); assert.equal(calls, 1);
  } finally { globalThis.Element = original; configureFrontend({}); }
});

test('document queries are isolated to the host root and website queries remain global', () => {
  const original = globalThis.document; const seen = [];
  globalThis.document = { querySelector: selector => { seen.push(selector); return null; } };
  try {
    configureFrontend({ rootSelector: '.embedded' }); frontendDocument.querySelector('.event, .modal');
    assert.equal(seen[0], '.embedded:is(.event, .modal), .embedded :is(.event, .modal)');
    configureFrontend({}); frontendDocument.querySelector('.event'); assert.equal(seen[1], '.event');
  } finally { globalThis.document = original; configureFrontend({}); }
});

// A contained fixed drag layer uses panel coordinates, while pointer deltas
// stay in viewport coordinates. Both must land the card under the pointer.
test('drag coordinates preserve the grab point in embedded and standalone calendars', () => {
  const original = globalThis.document;
  globalThis.document = { querySelector: () => ({ getBoundingClientRect: () => ({ left: 280, top: 64 }) }) };
  try {
    for (const embedded of [true, false]) {
      configureFrontend(embedded ? { rootSelector: '.embedded' } : {});
      const card = { left: 420, top: 220 };
      const grab = { x: 30, y: 8 };
      const pointer = { x: 610, y: 302 };
      const start = panelCoordinates(card.left, card.top);
      const delta = { x: pointer.x - card.left - grab.x, y: pointer.y - card.top - grab.y };
      assert.equal(start.left + delta.x + (embedded ? 280 : 0) + grab.x, pointer.x);
      assert.equal(start.top + delta.y + (embedded ? 64 : 0) + grab.y, pointer.y);
    }
  } finally { globalThis.document = original; configureFrontend({}); }
});
