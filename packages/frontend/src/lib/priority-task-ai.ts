/** Open the same native capture dialog as Command-T, with the active task's host context. */
export function openPriorityTaskCapture(anchor: HTMLElement | null) {
  if (!anchor?.isConnected || !anchor.hasAttribute("data-triage-capture")) {
    throw new Error("Open priority triage in BB to send this task to an agent.");
  }
  window.dispatchEvent(new CustomEvent("bb:capture-message", { detail: { anchor } }));
}
