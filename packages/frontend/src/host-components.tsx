import { frontendHost } from "./runtime.js";
export function TaskContext({ description }: { description: string }) {
  return frontendHost().renderTaskContext?.(description) ?? null;
}
