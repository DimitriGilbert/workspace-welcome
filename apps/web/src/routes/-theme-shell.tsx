import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { z } from "zod";

import { ThemeScope } from "@workspace-welcome/ui/components/theme-scope";

import Loader from "@/components/loader";
import { useScanQuery } from "@/lib/queries/scan";
import { themeCustomCssHref, themePresets } from "@/components/themes";
import type { ThemePreset } from "@/components/themes";

/**
 * Shared plumbing for the two top-level theme routes (`/` dashboard +
 * `/project/$` project). The leading hyphen keeps this file out of the
 * route tree — it is route plumbing, not a route.
 *
 * M1 state: a route resolves the slug against the preset registry, mounts
 * the theme scope (one per page, per the system contract) and renders an
 * explicit "renderer pending" state. `renderLayout` — the W4 renderer that
 * turns `preset.dashboard` / `preset.project` into a board — does not exist
 * yet, so nothing is drawn from the preset and none is faked. The integration
 * phases (W4/M3/D8) replace the pending slot with the renderer + provider
 * stack; the routes themselves stay as scaffolded here.
 */

/**
 * The theme pages' search params: `?bare=1` drops `custom.css` from the head;
 * `?scheme=<id>` forces a color scheme (harness + deep links — a page that
 * wants the SAVED scheme omits it); `?preset=<slug>` is the dead `/app/<slug>`
 * redirect's cargo — the target page persists it as the saved preset on
 * mount. The router JSON-parses search values, so `bare=1` on the wire
 * arrives here as the NUMBER 1; the string form is accepted for symmetry
 * (code-passed `search: { bare: "1" }` serializes quoted and round-trips).
 * Anything else catches to absent and the router normalizes it off the URL.
 */
export const themeSearchSchema = z.object({
  bare: z.union([z.literal(1), z.literal("1")]).optional().catch(undefined),
  scheme: z.string().min(1).optional().catch(undefined),
  preset: z.string().min(1).optional().catch(undefined),
});

export type ThemePageKind = "dashboard" | "project";

/**
 * The whole M1 page body once a preset resolves: optional `custom.css` in the
 * head (unless bare), then the theme scope with the explicit pending state
 * inside. The scope div stays classless — the ThemeScope CSS contract forbids
 * any containing-block-creating styles on it.
 */
export function ThemePageShell({
  preset,
  page,
  bare,
}: {
  preset: ThemePreset;
  page: ThemePageKind;
  bare: boolean;
}) {
  const customCssHref = bare ? null : themeCustomCssHref(preset.id);
  return (
    <>
      {customCssHref !== null && (
        // React 19 hoists `precedence` stylesheets into the document head on
        // the server and the client; unmounting it (a bare toggle) removes it.
        <link
          rel="stylesheet"
          href={customCssHref}
          precedence="ww-theme-custom-css"
        />
      )}
      <ThemeScope theme={preset.id} data-ww-page={page}>
        <RendererPending preset={preset} page={page} />
      </ThemeScope>
    </>
  );
}

/**
 * Honest interim state until the W4 renderer lands: the preset resolved, but
 * there is no board to draw from it yet — so none is drawn.
 */
function RendererPending({
  preset,
  page,
}: {
  preset: ThemePreset;
  page: ThemePageKind;
}) {
  return (
    <div
      data-renderer-state="pending"
      className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-3 px-5 py-6 sm:px-8"
    >
      <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        {preset.label} · {page}
      </p>
      <h1 className="text-sm font-semibold tracking-tight">Renderer pending</h1>
      <p className="text-xs leading-relaxed text-muted-foreground">
        The theme preset for <span className="font-mono">{preset.id}</span>{" "}
        resolves, but the widget renderer that draws this {page} page from it
        is not wired yet — it arrives with the runtime integration phase. No
        board is rendered in its place.
      </p>
    </div>
  );
}

/**
 * Explicit not-found state for a slug the registry does not know — never a
 * fake board. (The dead `/app/<slug>` redirects drop unknown slugs en route;
 * this state remains for callers that resolve a slug directly.)
 */
export function ThemeNotFound({ slug }: { slug: string }) {
  const available = [...themePresets.keys()];
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-3 px-5 py-6 sm:px-8">
      <h1 className="text-sm font-semibold tracking-tight">Theme not found</h1>
      <p className="text-xs leading-relaxed text-muted-foreground">
        No theme preset is registered for{" "}
        <span className="break-all font-mono">{slug}</span>.
      </p>
      {available.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Registered themes:</p>
          <ul className="flex flex-wrap gap-2">
            {available.map((id) => (
              <li key={id}>
                <Link
                  to="/"
                  search={{ preset: id }}
                  className="font-mono text-xs underline underline-offset-2 hover:text-foreground"
                >
                  {id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No themes are registered yet — presets land with the theme migration
          wave.
        </p>
      )}
    </div>
  );
}

/**
 * The known-project gate (owner order: fix the "Not a known project" bug at
 * the navigation layer — never mount a doomed provider stack for a path the
 * scanner doesn't know, and never leave the error to a raw server toast).
 *
 * Wraps a project page's body and consults the SAME cached scan the provider
 * stack reads. The contract is strict — the page body mounts ONLY when the
 * scan knows the path:
 *
 * - scan failed → an honest scan-error card with the server's message;
 * - scan knows the path → `children` (the real board) render unchanged;
 * - scan settled without the path, no fetch in flight → the honest
 *   "not a known project" card with a picker over the scanned projects
 *   (same-theme project routes), so a moved/nested/hidden or mistyped path
 *   is recoverable in one click;
 * - otherwise (loading, or a catch-up refetch in flight) → a neutral
 *   loading shell. The catch-up refetch fires once per mount when the
 *   settled scan lacks the path, so deep links to freshly scaffolded
 *   projects land as soon as the scan sees them — without ever firing the
 *   doomed per-project queries (report command, git, files) for an unknown
 *   path.
 */
export function ProjectKnownGate({
  theme,
  path,
  children,
}: {
  theme: string;
  path: string;
  children: ReactNode;
}) {
  const scan = useScanQuery();
  const refetched = useRef(false);
  const known = scan.data?.projects.some((project) => project.path === path) ?? false;

  useEffect(() => {
    if (refetched.current || known || scan.isError || scan.isLoading || scan.isFetching) {
      return;
    }
    refetched.current = true;
    void scan.refetch();
  }, [known, scan.isError, scan.isLoading, scan.isFetching, scan.refetch]);

  if (scan.isError) {
    return (
      <ProjectGateCard title="Scan failed">
        The workspace scan backing this page failed with:{" "}
        <span className="font-mono">{scan.error?.message ?? "unknown error"}</span>{" "}
        — the project readout can&rsquo;t be built without it.{" "}
        <GateBackLink theme={theme} />
      </ProjectGateCard>
    );
  }
  if (known) {
    return <>{children}</>;
  }
  if (scan.isLoading || scan.isFetching) {
    return (
      <div
        data-project-gate="loading"
        className="flex h-svh w-full items-center justify-center"
      >
        <Loader />
      </div>
    );
  }
  return <ProjectNotKnown theme={theme} path={path} projects={scan.data?.projects ?? []} />;
}

/** The honest not-known card: the path, why it can happen, and the picker. */
function ProjectNotKnown({
  theme,
  path,
  projects,
}: {
  theme: string;
  path: string;
  projects: { path: string; name: string }[];
}) {
  return (
    <ProjectGateCard title="Not a known project">
      <span className="break-all font-mono">{path}</span> isn&rsquo;t in the
      current scan — it may have been moved, renamed, nested under another
      project, hidden, or mistyped. Reports and git actions only run on
      projects that live directly under a tracked directory.
      {projects.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Known projects:</p>
          <ul className="grid max-h-64 grid-cols-1 gap-x-4 gap-y-0.5 overflow-y-auto sm:grid-cols-2">
            {projects.map((project) => (
              <li key={project.path}>
                <Link
                  to="/project/$"
                  params={{ _splat: project.path.replace(/^\/+/, "") }}
                  search={{ preset: theme }}
                  className="block truncate font-mono text-xs underline underline-offset-2 hover:text-foreground"
                >
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          No projects are in the scan right now — add a tracked directory
          first.
        </p>
      )}
      <div className="mt-2">
        <GateBackLink theme={theme} />
      </div>
    </ProjectGateCard>
  );
}

function ProjectGateCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-3 px-5 py-6 sm:px-8">
      <div className="w-full border border-foreground/10 p-4">
        <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {children}
        </p>
      </div>
    </div>
  );
}

function GateBackLink({ theme }: { theme: string }) {
  return (
    <Link
      to="/"
      search={{ preset: theme }}
      className="font-mono text-xs underline underline-offset-2 hover:text-foreground"
    >
      Back to the {theme} board
    </Link>
  );
}
