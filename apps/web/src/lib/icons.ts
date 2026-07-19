import {
  Boxes,
  Container,
  Diamond,
  FileCode2,
  Flame,
  Gem,
  GitBranch,
  Package,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { GitHost } from "@workspace-welcome/api/lib/types";

/**
 * Pick an icon per detected stack id. These are heuristic — we use generic
 * icons rather than brand logos to avoid trademark quirks; the label text
 * carries the precise identification.
 */
const STACK_ICONS: Record<string, LucideIcon> = {
  rust: Flame,
  go: Package,
  deno: Diamond,
  "python-poetry": FileCode2,
  "python-pip": FileCode2,
  ruby: Gem,
  elixir: Wrench,
  php: FileCode2,
  maven: Boxes,
  gradle: Boxes,
  node: Terminal,
  nix: Container,
  docker: Container,
};

export function stackIcon(id: string | undefined): LucideIcon {
  if (!id) return FileCode2;
  return STACK_ICONS[id] ?? FileCode2;
}

const HOST_LABEL: Record<GitHost, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  codeberg: "Codeberg",
  sourcehut: "sourcehut",
  other: "remote",
};

export function hostLabel(host: GitHost): string {
  return HOST_LABEL[host];
}

/** The git-branch icon is reused widely; export for convenience. */
export { GitBranch };
