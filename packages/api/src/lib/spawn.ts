import { spawn } from "node:child_process";

import type { Settings } from "./types";

/**
 * Launch external programs (editor, terminal, file manager) from the server.
 *
 * `detached: true` + `unref()` lets the child outlive the server process so we
 * don't kill the user's editor when the dev server restarts. stdio is ignored
 * so the child never blocks on the server's pipes.
 */

export type OpenTarget = "editor" | "terminal" | "folder";

export interface OpenResult {
  ok: boolean;
  /** What we attempted, surfaced for the toast. */
  message: string;
}

function launch(args: string[]): OpenResult {
  try {
    const child = spawn(args[0] ?? "", args.slice(1), {
      detached: true,
      stdio: "ignore",
      cwd: process.env.HOME,
    });
    child.on("error", () => undefined);
    child.unref();
    return { ok: true, message: "Launched" };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message || "Failed to launch",
    };
  }
}

const isLinux = process.platform === "linux";
const isMac = process.platform === "darwin";

/** Open `path` with the configured editor command. */
export function openEditor(path: string, settings: Settings): OpenResult {
  return launch([settings.editorCommand, path]);
}

/** Open `path` in a terminal (requires a configured terminalCommand). */
export function openTerminal(path: string, settings: Settings): OpenResult {
  if (!settings.terminalCommand) {
    return {
      ok: false,
      message: "No terminal command configured",
    };
  }
  return launch([settings.terminalCommand, "--working-directory", path]);
}

/** Open the project folder in the OS file manager. */
export function openFolder(path: string): OpenResult {
  if (isMac) return launch(["open", path]);
  if (isLinux) return launch(["xdg-open", path]);
  // Windows / other — best effort.
  return launch(["explorer", path]);
}

/** Resolve a generic target into the right launcher. */
export function openForTarget(
  target: OpenTarget,
  path: string,
  settings: Settings,
): OpenResult {
  switch (target) {
    case "editor":
      return openEditor(path, settings);
    case "terminal":
      return openTerminal(path, settings);
    case "folder":
      return openFolder(path);
  }
}
