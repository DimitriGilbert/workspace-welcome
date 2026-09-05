import type { ArtifactMediaEntry } from "@workspace-welcome/api/lib/artifacts";

/**
 * URL for streaming one artifact through /api/artifacts/view. The `v`
 * parameter is a cache-buster derived from the file's mtime, so a test run
 * that overwrites a screenshot busts the browser cache without any
 * server-side invalidation — no v change, cached; changed file, fresh.
 */
export function artifactViewUrl(
  project: string,
  entry: Pick<ArtifactMediaEntry, "path" | "modifiedAt">,
): string {
  const bust = new Date(entry.modifiedAt).getTime().toString(36);
  return `/api/artifacts/view?project=${encodeURIComponent(project)}&path=${encodeURIComponent(entry.path)}&v=${bust}`;
}
