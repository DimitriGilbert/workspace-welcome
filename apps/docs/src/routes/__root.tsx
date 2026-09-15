import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { NotFoundContent } from "./404";
import { seoHead } from "../seo";
import {
	DEFAULT_DOCS_THEME,
	DocsThemeProvider,
	themeInitScript,
	useDocsTheme,
} from "../theme";
import appCss from "../index.css?url";

const rootSeo = seoHead({
	title: "welcome-workspace",
	description:
		"Local dashboard for your projects folder. Scans git, stack, and health. No accounts, no cloud.",
	path: "/",
});

export const Route = createRootRoute({
	notFoundComponent: NotFoundContent,
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			...rootSeo().meta,
		],
		// No canonical here: the router merges link tags without deduping, and
		// every page route supplies its own per-page canonical via seoHead.
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	component: RootDocument,
});

/** Browser-chrome tint per identity — tracks the scope's `--background`. */
const THEME_COLOR: Record<string, string> = {
	"mission-control": "#1d2126",
	bento: "#1e2129",
	meadow: "#f3f2e4",
};

function RootDocument() {
	return (
		<html
			lang="en"
			className="dark"
			// SSR renders the default identity; the inline script below re-stamps
			// the saved one before first paint (hence suppressHydrationWarning).
			data-ww-theme={DEFAULT_DOCS_THEME}
			suppressHydrationWarning
		>
			<head>
				{/*
				 * Owner's self-hosted analytics — verbatim tag, docs site only.
				 */}
				<script
					src="https://chemin.dbuild.dev/script.js"
					data-id="7040d34e-b41f-4f20-88d1-b86ac93266c4"
					data-utcoffset="2"
					data-server="https://chemin.dbuild.dev"
				></script>
				{/*
				 * Adopt the saved site theme BEFORE first paint — no flash of the
				 * wrong identity. Must stay ahead of the stylesheet application.
				 */}
				<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
				<HeadContent />
			</head>
			<body className="min-h-svh bg-background font-sans text-foreground antialiased">
				<DocsThemeProvider>
					{/*
					 * Hoisted into <head> by React 19 — lives here so it can read the
					 * theme context and track the active identity.
					 */}
					<ThemeColorMeta />
					<div className="flex min-h-svh flex-col">
						<SiteHeader />
						<Outlet />
						<SiteFooter />
					</div>
				</DocsThemeProvider>
				{import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-left" /> : null}
				<Scripts />
			</body>
		</html>
	);
}

/**
 * The per-identity browser-chrome tint. Rendered inside the provider so a
 * theme switch re-renders it; React 19 hoists the tag into <head>.
 */
function ThemeColorMeta() {
	const { theme } = useDocsTheme();
	return <meta name="theme-color" content={THEME_COLOR[theme]} />;
}
