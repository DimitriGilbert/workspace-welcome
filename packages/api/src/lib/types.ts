/**
 * Shared domain types for the workspace scanner.
 * These are inferred into the tRPC router and consumed by the web client.
 */

/** A registered root directory that the scanner walks for projects. */
export interface Root {
  id: string;
  /** Absolute filesystem path. */
  path: string;
  /** Optional human label, e.g. "work" / "personal". */
  label: string;
  addedAt: string;
}

/** User-controlled, per-project overrides persisted across rescans. */
export interface ProjectOverrides {
  pinned: boolean;
  /** "Where I left off" free-form note. */
  note: string;
  /** ISO timestamp of the last time the user opened the project from the UI. */
  lastOpenedAt: string | null;
  /** When true, the project is excluded from all lists. */
  hidden: boolean;
}

/** A parsed git remote, host-agnostic. */
export interface RemoteInfo {
  /** Raw remote URL as git knows it. */
  url: string;
  /** Normalized host: github | gitlab | bitbucket | codeberg | sourcehut | other. */
  host: GitHost;
  /** "owner/repo" for the common hosts; null when unparseable. */
  slug: string | null;
  /** Deep links derived from host + slug. */
  links: {
    /** Repo home page. */
    web: string;
    /** Issues/merge-request list (host-appropriate). */
    issues: string;
    /** Pull-request/merge-request list (host-appropriate). */
    pulls: string;
  };
}

/** What we know about a project's git state. */
export interface GitInfo {
  isRepo: boolean;
  branch: string | null;
  remote: RemoteInfo | null;
  /** Commits on local branch not on upstream. */
  ahead: number | null;
  /** Commits on upstream not on local branch. */
  behind: number | null;
  /** Number of uncommitted (dirty) files. */
  dirtyCount: number | null;
  lastCommit: {
    message: string;
    author: string;
    /** ISO timestamp. */
    date: string | null;
  } | null;
}

/** Detected language/toolchain from a manifest file. */
export interface StackInfo {
  /** Stable identifier, e.g. "node", "rust". */
  id: string;
  /** Display label, e.g. "Node.js", "Rust". */
  label: string;
  /** Manifest filename that triggered the detection. */
  manifest: string;
}

export type AlertSeverity = "error" | "warn" | "info";

export type AlertCode =
  | "no-remote"
  | "diverged"
  | "behind"
  | "unpushed"
  | "dirty"
  | "stale-wip"
  | "dormant";

export interface HealthAlert {
  severity: AlertSeverity;
  code: AlertCode;
  message: string;
}

/** A scanned project, ready to render. */
export interface Project {
  /** Absolute path — the stable identity of a project. */
  path: string;
  /** Directory basename. */
  name: string;
  /** Which root id this project lives under. */
  rootId: string;
  /** ISO timestamp of project directory creation. */
  createdAt: string;
  /** ISO timestamp of the most recent meaningful activity (see scan.ts). */
  updatedAt: string;
  stack: StackInfo | null;
  git: GitInfo;
  alerts: HealthAlert[];
  // Overrides (merged from the store):
  pinned: boolean;
  note: string;
  lastOpenedAt: string | null;
  hidden: boolean;
}

export interface ScanResult {
  projects: Project[];
  /** Roots that could not be read (missing/permission), surfaced to the UI. */
  rootErrors: { rootId: string; path: string; message: string }[];
}

export type GitHost =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "codeberg"
  | "sourcehut"
  | "other";

/** Settings persisted to the store. */
export interface Settings {
  /** Command used to open a project in an editor, e.g. "code" or "cursor". */
  editorCommand: string;
  /** Command used to open a terminal at a project; null disables it. */
  terminalCommand: string | null;
  /** Additional glob-style directory names to skip when computing updatedAt. */
  excludeGlobs: string[];
}

export interface StoreShape {
  roots: Root[];
  /** Keyed by absolute project path. */
  projects: Record<string, ProjectOverrides>;
  settings: Settings;
}
