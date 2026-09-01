import { scaffoldInputSchema } from "@workspace-welcome/api/lib/scaffold-options";

import type { ScaffoldInput } from "@workspace-welcome/api/lib/scaffold-options";

/**
 * The scaffold-seed handoff between the create-success toast and the ideation
 * panel (PRD §3), split out of the panel component so the home route can
 * derive the identical key without statically importing the panel's chat
 * graph into its chunk. Imports only the client-safe schema half of the
 * scaffold configuration (scaffold-options.ts is deliberately Node-free).
 */

/**
 * sessionStorage key of the scaffold-seed handoff (PRD §3): the
 * create-success toast parks the wizard's ScaffoldInput here, keyed by the
 * project's absolute path, and the ideation panel reads it at session.start —
 * the transient scaffold job registry GCs its snapshots after 15 min
 * (scaffold.ts), so the seed is persisted into session.json instead of
 * fetched later.
 */
export function ideationScaffoldSeedKey(project: string): string {
  return `ideation:scaffold-seed:${project}`;
}

/**
 * The stored seed, validated through the client-safe schema — a corrupt or
 * foreign entry yields null and is simply not seeded, never trusted blind.
 */
export function readIdeationScaffoldSeed(
  project: string,
): ScaffoldInput | null {
  const raw = sessionStorage.getItem(ideationScaffoldSeedKey(project));
  if (raw === null) return null;
  try {
    const parsed = scaffoldInputSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
