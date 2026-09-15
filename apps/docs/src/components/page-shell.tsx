import type { ReactNode } from "react";

import { PageRail } from "@workspace-welcome/ui/components/page-rail";

/**
 * Content under the shared masthead: same rail as apps/web. A page title
 * stands alone: no kicker above it, no lead under it. Anything worth saying
 * is a sentence in the body.
 */
export function PageShell({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<PageRail className="pb-10 pt-8">
			<header className="mb-10 max-w-3xl">
				<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
			</header>
			{children}
		</PageRail>
	);
}
