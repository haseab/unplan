import type { ReactNode } from "react";
import type { CalendarEvent } from "./lib/calendar-types.js";
import type { TodoistTask } from "./lib/todoist.js";

export type FrontendNavigation = { replace(path: string): void; refresh(): void };
/** One host configuration per application bundle. Never changes global browser APIs. */
export type FrontendHost = {
  request?: typeof fetch;
  rootSelector?: string;
  preferenceKey?: (key: string) => string;
  googleClientId?: string;
  timelineHistory?: { destination: "retrace" | "project-three"; altKey: boolean };
  serverManagedAuth?: boolean;
  websiteUrl?: (path: string) => string;
  useNavigation?: () => FrontendNavigation;
  useLifetimeCleanup?: (cleanup: () => void) => void;
  mountCalendarFocus?: (focusPresent: () => boolean) => () => void;
  mountCalendarSearch?: (actions: { find: () => void; search: () => void }) => () => void;
  renderTaskContext?: (description: string) => ReactNode;
  captureIdFromDescription?: (description: string) => string | null | undefined;
  taskReviewBanners?: boolean;
  eventCaptureAttributes?: (event: CalendarEvent | null) => Record<string, string | undefined>;
  taskCaptureAttributes?: (task: TodoistTask | null, disabled: boolean) => Record<string, string | undefined>;
  undoActionAttributes?: (id: string) => Record<string, string | undefined>;
  applyTheme?: (theme: "dark" | "light") => void;
};
let host: Readonly<FrontendHost> = Object.freeze({});
export function configureFrontend(value: FrontendHost) {
  host = Object.freeze({ ...value });
}
export function frontendHost() { return host; }
export function frontendFetch(input: RequestInfo | URL, init?: RequestInit) {
  // Capture the transport before awaiting: navigation cannot redirect an in-flight save.
  const request = host.request ?? globalThis.fetch;
  return request(input, init);
}
export function preferenceKey(key: string) { return host.preferenceKey?.(key) ?? key; }
export const frontendStorage: Storage = {
  get length() { return window.localStorage.length; },
  key(index) { return window.localStorage.key(index); },
  getItem(key) { return window.localStorage.getItem(preferenceKey(key)); },
  setItem(key, value) { window.localStorage.setItem(preferenceKey(key), value); },
  removeItem(key) { window.localStorage.removeItem(preferenceKey(key)); },
  // Application code should remove its own keys, never clear another host's preferences.
  clear() { throw new Error("Clear named Unplan preferences individually."); },
};
const scopedSelector = (selector: string) => host.rootSelector
  ? `${host.rootSelector}:is(${selector}), ${host.rootSelector} :is(${selector})`
  : selector;
export const frontendDocument = {
  querySelector<T extends Element = Element>(selector: string) { return document.querySelector<T>(scopedSelector(selector)); },
  querySelectorAll<T extends Element = Element>(selector: string) { return document.querySelectorAll<T>(scopedSelector(selector)); },
};
type KeyListener = (event: KeyboardEvent) => void;
const listeners = new WeakMap<KeyListener, Map<EventTarget, Map<boolean, EventListener>>>();
export function addScopedKeyListener(target: EventTarget, listener: KeyListener, options?: boolean | AddEventListenerOptions) {
  const capture = typeof options === "boolean" ? options : !!options?.capture;
  const targets = listeners.get(listener) ?? new Map(); listeners.set(listener, targets);
  const captures = targets.get(target) ?? new Map(); targets.set(target, captures);
  if (captures.has(capture)) return;
  const selector = host.rootSelector;
  const scoped: EventListener = event => {
    if (!selector || (event.target instanceof Element && event.target.closest(selector))) listener(event as KeyboardEvent);
  };
  captures.set(capture, scoped); target.addEventListener("keydown", scoped, options);
}
export function removeScopedKeyListener(target: EventTarget, listener: KeyListener, options?: boolean | EventListenerOptions) {
  const capture = typeof options === "boolean" ? options : !!options?.capture;
  const captures = listeners.get(listener)?.get(target); const scoped = captures?.get(capture);
  if (scoped) { target.removeEventListener("keydown", scoped, { capture }); captures?.delete(capture); }
}
export function panelCoordinates(left: number, top: number) {
  const bounds = host.rootSelector ? document.querySelector(host.rootSelector)?.getBoundingClientRect() : null;
  return { left: left - (bounds?.left ?? 0), top: top - (bounds?.top ?? 0) };
}
export function taskCaptureAttributes(task: TodoistTask | null, disabled = false) { return host.taskCaptureAttributes?.(task, disabled) ?? {}; }
export function captureIdFromDescription(description: string) { return host.captureIdFromDescription?.(description) ?? null; }
export function applyFrontendTheme(theme: "dark" | "light") {
  if (host.applyTheme) host.applyTheme(theme);
  else document.documentElement.dataset.theme = theme;
}

export function eventCaptureAttributes(event: CalendarEvent | null) { return host.eventCaptureAttributes?.(event) ?? {}; }
