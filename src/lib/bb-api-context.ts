import { AsyncLocalStorage } from "node:async_hooks";
// Set only after the dedicated BB API key has been verified. Never infer this
// context from a browser-provided owner or account identifier.
const owners = new AsyncLocalStorage<string>();
export const bbApiOwner = () => owners.getStore();
export const withBbApiOwner = <T>(owner: string, run: () => T) => owners.run(owner, run);
