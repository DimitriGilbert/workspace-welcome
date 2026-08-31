import type { ScaffoldInput } from "../scaffold-options";
import { agentsMdConfigFromScaffoldInput } from "./adapters";
import { commonDirectives } from "./directives";
import type { DirectiveContext } from "./directives";
import { buildStackView } from "./stack-view";
import type { AgentsMdConfig } from "./types";

/**
 * Render the AGENTS.md for a normalized Better-T-Stack config: a minimal
 * root file (≤ ~60 lines) following the agents-md skill — a description
 * paragraph with the package-manager discipline folded in, a
 * capabilities-not-paths monorepo table, real commands only, and the common
 * directive set. Sections that do not apply to the config are omitted.
 */
export function generateAgentsMd(config: AgentsMdConfig): string {
  const view = buildStackView(config);
  const context: DirectiveContext = { runCmd: view.runCmd, catalogHint: view.catalogHint };
  const lines: string[] = [
    `${view.description} ${view.packageManagerLine}`,
    "",
    "Scaffolded with Better-T-Stack — treat `bts.jsonc` as the stack source of truth.",
    "",
    "## Monorepo",
    "",
    view.workspaceIntro,
    "",
    "| Path | Package | Purpose |",
    "|------|---------|---------|",
    ...view.packageRows.map((row) => `| \`${row.path}\` | \`${row.name}\` | ${row.purpose} |`),
    "",
    "## Commands",
    "",
    ...view.commands,
    "",
    "## Working agreements",
    "",
    ...commonDirectives.map((directive) => directive.text(context)),
    ...view.extraAgreements,
  ];
  return `${lines.join("\n")}\n`;
}

/** Convenience for the in-process scaffold job (Phase 3): wizard input straight to markdown. */
export function generateAgentsMdFromScaffoldInput(input: ScaffoldInput): string {
  return generateAgentsMd(agentsMdConfigFromScaffoldInput(input));
}
