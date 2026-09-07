import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@workspace-welcome/api/routers/index";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@workspace-welcome/ui/components/sonner";
import { lazy, Suspense, type ComponentProps, type ComponentType } from "react";

import { WidgetPrefsProvider } from "@/widgets/theme-prefs";

import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import appCss from "../index.css?url";
export interface RouterAppContext {
  trpc: TRPCOptionsProxy<AppRouter>;
  queryClient: QueryClient;
}

type ReactQueryDevtoolsComponent = ComponentType<
  ComponentProps<(typeof import("@tanstack/react-query-devtools"))["ReactQueryDevtools"]>
>;
type TanStackRouterDevtoolsComponent = ComponentType<
  ComponentProps<(typeof import("@tanstack/react-router-devtools"))["TanStackRouterDevtools"]>
>;

// Dev-only tools: the static `import.meta.env.DEV` branch is folded to `false`
// in production builds, dead-code-eliminating the dynamic imports and the
// devtools chunks; in dev they lazy-load as usual.
const ReactQueryDevtools: ReactQueryDevtoolsComponent = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : () => null;

const TanStackRouterDevtools: TanStackRouterDevtoolsComponent = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools,
      })),
    )
  : () => null;

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Workspace Welcome",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {/*
         * next-themes owns the color scheme (owner order): it persists the
         * light/dark choice in localStorage and flips the `class` on <html>.
         * The SSR default below (`className="dark"`) matches the provider's
         * `defaultTheme="dark"` so server and client agree on first paint;
         * `enableSystem={false}` keeps the legacy pages' dark styling until
         * the user explicitly picks a scheme (theme picker in the header).
         * WidgetPrefsProvider layers the saved preset slug + per-preset
         * scheme on the same storage contract (see widgets/theme-prefs).
         *
         * The storage key is app-private ON PURPOSE. next-themes re-applies
         * `storage` events under its key from ANY same-origin tab, so the
         * legacy shared "theme" key let a stale tab still running the old
         * widget JS (whose two theme pickers fought each other) flip the
         * html class in every other open tab — the app chrome (scrollbar,
         * `dark:`-variant buttons, select triggers) alternating
         * darker/whiter while the board kept its scheme tokens. With the
         * namespaced key, foreign "theme" writes are ignored; this app's
         * own pickers are the only writers of `ww.theme.v1`, and they
         * re-assert the active scheme's appearance after every load.
         */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
          storageKey="ww.theme.v1"
        >
          <WidgetPrefsProvider>
            <div className="min-h-svh">
              <Outlet />
            </div>
            <Toaster richColors />
          </WidgetPrefsProvider>
        </ThemeProvider>
        <Suspense fallback={null}>
          <TanStackRouterDevtools position="bottom-left" />
          <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        </Suspense>
        <Scripts />
      </body>
    </html>
  );
}
