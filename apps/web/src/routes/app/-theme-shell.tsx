import { Link } from "@tanstack/react-router";
import { z } from "zod";

import { ThemeScope } from "@workspace-welcome/ui/components/theme-scope";

import { themeCustomCssHref, themePresets } from "@/widgets/themes";
import type { ThemePreset } from "@/widgets/themes";

/**
 * Shared plumbing for the two `/app/$theme` routes (dashboard + project).
 * The leading hyphen keeps this file out of the route tree — it is route
 * plumbing, not a route.
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
 * The theme pages' only search param: `?bare=1` drops `custom.css` from the
 * head. The router JSON-parses search values, so `bare=1` on the wire arrives
 * here as the NUMBER 1; the string form is accepted for symmetry (code-passed
 * `search: { bare: "1" }` serializes quoted and round-trips). Anything else
 * catches to absent and the router normalizes it off the URL.
 */
export const themeSearchSchema = z.object({
  bare: z.union([z.literal(1), z.literal("1")]).optional().catch(undefined),
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
 * fake board. Lists the registered themes so a typo is recoverable.
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
                  to="/app/$theme"
                  params={{ theme: id }}
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
