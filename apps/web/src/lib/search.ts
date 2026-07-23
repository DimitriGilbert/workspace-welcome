/**
 * Inline project search.
 *
 * Plain substring matching across the fields a developer actually scans for:
 * name, path, stack label, git branch, git remote host, and the free-form
 * note. No fuzzy matching, no scoring — the dataset is small and in memory,
 * so we keep it cheap and predictable.
 *
 * A query is split on whitespace into terms; ALL terms must match somewhere
 * (AND semantics) so "react main" finds React projects currently on the
 * `main` branch rather than the union of both.
 */

import type { Project } from "@workspace-welcome/api/lib/types";

/** Split a raw query into normalized, non-empty terms. */
export function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Lowercased haystack of every searchable field on a project. Built per
 * project per filter pass; for a few hundred items that's negligible.
 */
function projectHaystack(p: Project): string {
  return [
    p.name,
    p.path,
    p.stack?.label,
    p.git.branch,
    p.git.remote?.host,
    p.note,
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" \u0001 ") // separator unlikely to appear in real data
    .toLowerCase();
}

/** True if every term in `terms` is a substring of some searchable field. */
export function matchTerms(p: Project, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = projectHaystack(p);
  return terms.every((t) => haystack.includes(t));
}

/**
 * Main entry: does `query` match `project`? An empty/blank query matches
 * everything so callers can pipe the full list through unconditionally.
 */
export function matchProject(project: Project, query: string): boolean {
  return matchTerms(project, tokenizeQuery(query));
}
