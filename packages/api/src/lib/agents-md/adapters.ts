import type { ScaffoldInput } from "../scaffold-options";
import type { AgentsMdConfig } from "./types";

/**
 * Adapter for the in-process scaffold flow (Phase 3): the wizard shape has a
 * single web frontend plus a separate native field, and "none" examples.
 */
export function agentsMdConfigFromScaffoldInput(
  input: ScaffoldInput,
): AgentsMdConfig {
  return {
    projectName: input.projectName,
    frontends: [input.frontend],
    native: input.native,
    backend: input.backend,
    runtime: input.runtime,
    api: input.api,
    auth: input.auth,
    payments: input.payments,
    database: input.database,
    orm: input.orm,
    dbSetup: input.dbSetup,
    packageManager: input.packageManager,
    webDeploy: input.webDeploy,
    serverDeploy: input.serverDeploy,
    addons: input.addons,
    examples: input.examples === "none" ? [] : [input.examples],
  };
}
