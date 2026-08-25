import type { ScaffoldInput } from "@workspace-welcome/api/lib/scaffold-options";

/**
 * Client-side composition helpers for the create-project sheet. Both the live
 * command preview and the submit path run through the same pair, so the
 * preview can never disagree with what is sent to `scaffold.start`.
 */

/**
 * Apply the hidden-field rules the server schema also enforces: formedible
 * unmounts conditionally hidden fields but keeps their (stale) values, so a
 * fullstack (`self`) backend must carry `runtime: "none"` and
 * `serverDeploy: "none"` no matter what was picked while they were visible.
 */
export function normalizeScaffoldInput(values: ScaffoldInput): ScaffoldInput {
  if (values.backend !== "self") return values;
  return { ...values, runtime: "none", serverDeploy: "none" };
}

/**
 * The better-t-stack CLI invocation equivalent to this form state: the
 * `--frontend` flag lists web + native (native only when not "none"),
 * `--git`/`--install` appear only when true, and every other option renders
 * as `--flag value` in the order the server composes them. An empty project
 * name renders as `<name>` so the preview stays readable before it is typed.
 */
export function buildEquivalentCommand(input: ScaffoldInput): string {
  const parts: string[] = [
    "pnpm",
    "create",
    "better-t-stack@latest",
    input.projectName.trim() || "<name>",
  ];
  parts.push(
    "--frontend",
    ...(input.native === "none"
      ? [input.frontend]
      : [input.frontend, input.native]),
  );
  parts.push("--backend", input.backend);
  parts.push("--runtime", input.runtime);
  parts.push("--api", input.api);
  parts.push("--auth", input.auth);
  parts.push("--payments", input.payments);
  parts.push("--database", input.database);
  parts.push("--orm", input.orm);
  parts.push("--db-setup", input.dbSetup);
  parts.push("--package-manager", input.packageManager);
  if (input.git) parts.push("--git");
  parts.push("--web-deploy", input.webDeploy);
  parts.push("--server-deploy", input.serverDeploy);
  if (input.install) parts.push("--install");
  for (const addon of input.addons) parts.push("--addons", addon);
  parts.push("--examples", input.examples);
  return parts.join(" ");
}
