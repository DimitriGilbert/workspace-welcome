import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace-welcome/ui/components/button";
import { PageRail } from "@workspace-welcome/ui/components/page-rail";

/**
 * The not-found surface, shared by TWO hosts: the prerendered `/404` route
 * and the root router's `notFoundComponent` — on GitHub Pages an unknown
 * URL is served `404.html` AT that unknown path, so the client router must
 * brand the unmatched path itself, not just the literal `/404`.
 */
export function NotFoundContent() {
	return (
		<PageRail className="pb-10 pt-8">
			<p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-eyebrow">404</p>
			<h1 className="mt-3 text-2xl font-semibold tracking-tight">Nothing here</h1>
			<p className="mt-3 max-w-md text-base text-muted-foreground">
				That path isn&apos;t on this site. Maybe it moved, maybe it never existed.
			</p>
			<Button className="mt-6" render={<Link to="/" />}>
				Home
			</Button>
		</PageRail>
	);
}

export const Route = createFileRoute("/404")({
	component: NotFoundContent,
	head: () => ({
		meta: [
			{ title: "Not found — welcome-workspace" },
			{ name: "robots", content: "noindex" },
		],
	}),
});
