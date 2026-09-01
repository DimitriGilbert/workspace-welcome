import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import appCss from "../index.css?url";

const SITE_URL = "https://welcome-workspace.debuild.dev";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "welcome-workspace" },
      {
        name: "description",
        content:
          "Local dashboard for your projects folder. Scans git, stack, and health. No accounts, no cloud.",
      },
      { property: "og:title", content: "welcome-workspace" },
      {
        property: "og:description",
        content: "Local dashboard for the folder where your projects live.",
      },
      { property: "og:url", content: SITE_URL },
      { name: "theme-color", content: "#2a2218" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "canonical", href: SITE_URL },
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
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <div className="flex min-h-svh flex-col">
          <SiteHeader />
          <Outlet />
          <SiteFooter />
        </div>
        {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-left" /> : null}
        <Scripts />
      </body>
    </html>
  );
}
