import test from 'node:test';
import assert from 'node:assert/strict';
import { priorityCalendarTriageTasks, priorityCalendarShortcut } from '../dist/lib/priority-calendar-triage.js';
import { todoistContentWithGroup, todoistContentReturnedToTriage } from '../dist/lib/todoist-calendar.js';
import { openPriorityTaskCapture } from '../dist/lib/priority-task-ai.js';

const task = (id, group) => ({ id, content: todoistContentWithGroup(id, group), description: 'Example task context', priority: 1, projectId: 'tasks', due: null });

test('calendar queue includes current Right Now membership and descendants, preserving task order', () => {
  const returned = task('returned', 'Priority Right Now');
  returned.content = todoistContentReturnedToTriage(returned.content, 'Priority Right Now');
  const tasks = [task('today', 'Priority Today'), task('direct', 'Priority Right Now'), task('nested', 'Launch'),
    task('path', 'Work/ PRIORITY RIGHT NOW '), task('override', 'Priority Later'), returned, task('other', 'Ungrouped')];
  assert.deepEqual(priorityCalendarTriageTasks(tasks, { Launch: 'Priority Right Now', 'Priority Later': 'Priority Right Now' }).map(t => t.id), ['direct', 'nested', 'path']);
});

test('priority shortcuts match requested chords and leave other keyboard actions alone', () => {
  const key = (key, extra = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, ...extra });
  for (const modifier of ['metaKey', 'ctrlKey']) {
    assert.equal(priorityCalendarShortcut(key('ArrowLeft', { [modifier]: true, shiftKey: true })), 'schedule');
    assert.equal(priorityCalendarShortcut(key('Backspace', { [modifier]: true })), 'delete');
  }
  assert.equal(priorityCalendarShortcut(key('Enter', { altKey: true })), 'ai');
  assert.equal(priorityCalendarShortcut(key('Tab')), 'skip');
  assert.equal(priorityCalendarShortcut(key('Escape')), 'close');
  for (const event of [key('Backspace'), key('ArrowLeft'), key('Enter'), key('Tab', { shiftKey: true }),
    key('Enter', { altKey: true, metaKey: true }), key('Backspace', { metaKey: true, repeat: true }),
    key('Tab', { isComposing: true })]) assert.equal(priorityCalendarShortcut(event), null);
});

test('AI action opens the Command-T capture dialog using the current connected task anchor', () => {
  const originalWindow = globalThis.window;
  const originalEvent = globalThis.CustomEvent;
  const events = [];
  globalThis.window = { dispatchEvent: event => { events.push(event); return true; } };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  const anchor = { isConnected: true, hasAttribute: name => name === 'data-triage-capture' };
  try {
    openPriorityTaskCapture(anchor);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'bb:capture-message');
    assert.equal(events[0].detail.anchor, anchor);
    // No agent intent: show the same dialog as Command-T before choosing a new thread.
    assert.equal(events[0].detail.intent, undefined);
    for (const invalid of [null, { ...anchor, isConnected: false }, { ...anchor, hasAttribute: () => false }]) {
      assert.throws(() => openPriorityTaskCapture(invalid), /in BB/);
    }
    assert.equal(events.length, 1);
  } finally { globalThis.window = originalWindow; globalThis.CustomEvent = originalEvent; }
});
