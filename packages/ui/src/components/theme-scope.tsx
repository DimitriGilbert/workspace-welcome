"use client";

import * as React from "react";

/**
 * ThemeScope — mounts a themed subtree and routes portal content into it.
 *
 * The scope div stamps both `data-ww-theme={theme}` (theme token switch) and
 * `data-theme-scope` (scope marker for probes/tests). Descendants that portal
 * (dialogs, menus, popovers, toasts, …) call `useThemePortal()` and render
 * into the scope element instead of `document.body`, so theme CSS variables
 * declared on the scope apply to portaled content too.
 *
 * CSS CONTRACT — the scope div MUST NOT create a containing block for
 * `position: fixed` descendants. It is rendered with no inline styles, and
 * callers MUST NOT pass className/styles that add any of:
 * `transform`, `filter`, `backdrop-filter`, `perspective`, `contain`,
 * `content-visibility`, `z-index`, `position`, `overflow`, `clip-path`,
 * `will-change`, `isolation`, or `container-type` — any of these would make
 * portaled `position: fixed`/`fixed`-positioned popup content position and
 * clip against the scope instead of the viewport. Portal content keeps
 * viewport (`position: fixed`) semantics through this element.
 *
 * While the scope is not mounted (or during SSR), `useThemePortal()` returns
 * `null` and portal wrappers fall back to their default host
 * (`document.body`) — zero behavior change for existing pages.
 */

const ThemePortalContext = React.createContext<HTMLElement | null>(null);

export interface ThemeScopeProps extends React.ComponentProps<"div"> {
  /** Theme id stamped onto the scope as `data-ww-theme`. */
  theme: string;
}

function ThemeScope({ theme, children, ...props }: ThemeScopeProps) {
  const [host, setHost] = React.useState<HTMLElement | null>(null);

  return (
    <ThemePortalContext.Provider value={host}>
      <div
        data-ww-theme={theme}
        data-theme-scope=""
        ref={setHost}
        {...props}
      >
        {children}
      </div>
    </ThemePortalContext.Provider>
  );
}

/**
 * The nearest mounted ThemeScope element, or `null` when no scope is mounted.
 * Portal wrappers spread this as `container={useThemePortal() ?? undefined}`.
 */
function useThemePortal(): HTMLElement | null {
  return React.useContext(ThemePortalContext);
}

export { ThemeScope, ThemePortalContext, useThemePortal };
