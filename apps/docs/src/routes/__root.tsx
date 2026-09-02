import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { seoHead } from "../seo";
import appCss from "../index.css?url";

const rootSeo = seoHead({
	title: "welcome-workspace",
	description:
		"Local dashboard for your projects folder. Scans git, stack, and health. No accounts, no cloud.",
	path: "/",
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      ...rootSeo().meta,
      { name: "theme-color", content: "#2a2218" },
    ],
    // No canonical here: the router merges link tags without deduping, and
    // every page route supplies its own per-page canonical via seoHead.
    links: [{ rel: "stylesheet", href: appCss }],
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
