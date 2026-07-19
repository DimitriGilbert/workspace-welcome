import { randomUUID } from "node:crypto";

/** Tiny wrapper so we can swap the generator in tests. */
export function newId(): string {
  return randomUUID();
}
