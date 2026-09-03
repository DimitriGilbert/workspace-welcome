import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@workspace-welcome/api/routers/index";
import { Toaster } from "@workspace-welcome/ui/components/sonner";
import { lazy, Suspense, type ComponentProps, type ComponentType } from "react";

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
        <div className="min-h-svh">
          <Outlet />
        </div>
        <Toaster richColors />
        <Suspense fallback={null}>
          <TanStackRouterDevtools position="bottom-left" />
          <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        </Suspense>
        <Scripts />
      </body>
    </html>
  );
}
