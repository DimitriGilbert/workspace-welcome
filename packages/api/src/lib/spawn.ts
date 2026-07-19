import { execFileSync } from "node:child_process";
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
      env: { ...process.env },
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

// --- Terminals -------------------------------------------------------------

/**
 * Per-terminal working-directory invocation. Each entry maps a binary name to
 * the flag(s) it uses to set its starting directory. This matters because
 * terminals disagree (konsole: --workdir, gnome-terminal: --working-directory,
 * xterm has no such flag and needs a shell wrapper, etc.).
 */
const TERMINAL_SPECS: { bin: string; argsFor: (cwd: string) => string[] }[] = [
  { bin: "konsole", argsFor: (cwd) => ["--workdir", cwd] },
  { bin: "gnome-terminal", argsFor: (cwd) => [`--working-directory=${cwd}`] },
  { bin: "xfce4-terminal", argsFor: (cwd) => [`--working-directory=${cwd}`] },
  { bin: "mate-terminal", argsFor: (cwd) => [`--working-directory=${cwd}`] },
  { bin: "kitty", argsFor: (cwd) => ["--single-instance", "--directory", cwd] },
  { bin: "alacritty", argsFor: (cwd) => ["--working-directory", cwd] },
  { bin: "wezterm", argsFor: (cwd) => ["start", "--cwd", cwd] },
  { bin: "foot", argsFor: (cwd) => ["--working-directory", cwd] },
  { bin: "tilix", argsFor: (cwd) => [`--working-directory=${cwd}`] },
  { bin: "xterm", argsFor: (cwd) => ["-e", `cd ${shellQuote(cwd)} && exec $SHELL`] },
];

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'"'"'`)}'`;
}

/** True if the binary is on PATH. */
function isOnPath(bin: string): boolean {
  try {
    execFileSync("command", ["-v", bin], { stdio: "ignore", shell: true });
    return true;
  } catch {
    return false;
  }
}

/** Best-effort: find the first installed terminal on this machine. */
function detectDefaultTerminal(): string | null {
  for (const spec of TERMINAL_SPECS) {
    if (isOnPath(spec.bin)) return spec.bin;
  }
  return null;
}

/** Resolve a configured terminal command, falling back to auto-detection. */
function resolveTerminalCommand(configured: string | null): string | null {
  if (configured && configured.trim()) {
    const bin = configured.trim();
    if (isOnPath(bin)) return bin;
    // Configured but missing — surface this to the user rather than silently
    // swapping in something they didn't ask for.
    return null;
  }
  return detectDefaultTerminal();
}

/** Open `path` in a terminal. */
export function openTerminal(path: string, settings: Settings): OpenResult {
  const bin = resolveTerminalCommand(settings.terminalCommand);
  if (!bin) {
    const hint = settings.terminalCommand
      ? `'${settings.terminalCommand}' not found on PATH`
      : "No terminal configured and none auto-detected";
    return {
      ok: false,
      message: `${hint}. Set one in Settings (e.g. konsole, gnome-terminal, kitty).`,
    };
  }
  const spec = TERMINAL_SPECS.find((s) => s.bin === bin);
  if (!spec) {
    // Unknown binary: best-effort with the common flag.
    return launch([bin, "--working-directory", path]);
  }
  return launch([bin, ...spec.argsFor(path)]);
}

// --- Editor & folder -------------------------------------------------------

/** Open `path` with the configured editor command. */
export function openEditor(path: string, settings: Settings): OpenResult {
  return launch([settings.editorCommand, path]);
}

/** Open the project folder in the OS file manager. */
export function openFolder(path: string): OpenResult {
  if (process.platform === "darwin") return launch(["open", path]);
  if (process.platform === "linux") return launch(["xdg-open", path]);
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
