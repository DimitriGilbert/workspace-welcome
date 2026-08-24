/**
 * Run synchronous cleanup functions when the process exits or is signalled.
 *
 * The dev server restarts on every edit; without this, children spawned
 * attached (report runs, later the IDE child) would be orphaned mid-run and
 * keep running under init. Registered fns must be synchronous — the "exit"
 * event cannot await.
 */

type CleanupFn = () => void;

const fns = new Set<CleanupFn>();
let installed = false;

/**
 * Drain and run all registered fns. Draining (rather than iterating in place)
 * makes a signal path followed by process.exit — which re-fires "exit" — a
 * no-op instead of a double kill.
 */
function runAll(): void {
  const pending = [...fns];
  fns.clear();
  for (const fn of pending) {
    try {
      fn();
    } catch {
      // One failing cleanup must not block the rest or escape the handler.
    }
  }
}

/**
 * Install the single handler set. Signal handlers must re-terminate the
 * process explicitly: registering them replaces Node's default "die on
 * signal" behavior, and a server that swallows Ctrl-C is worse than none.
 */
function install(): void {
  if (installed) return;
  installed = true;
  process.on("exit", runAll);
  process.on("SIGTERM", () => {
    runAll();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    runAll();
    process.exit(0);
  });
}

/** Register a cleanup fn. Idempotent per fn (Set semantics). */
export function registerExitCleanup(fn: CleanupFn): void {
  install();
  fns.add(fn);
}

/** Drop a cleanup fn once its owner no longer needs to be killed on exit. */
export function deregisterExitCleanup(fn: CleanupFn): void {
  fns.delete(fn);
}
