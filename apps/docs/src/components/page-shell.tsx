import type { ReactNode } from "react";

import { PageRail } from "@workspace-welcome/ui/components/page-rail";

/**
 * Content under the shared masthead — same rail as apps/web. The kicker is
 * the app's mono-caps eyebrow idiom; the eyebrow COLOR token tracks the
 * active theme identity.
 */
export function PageShell({
	kicker,
	title,
	lead,
	children,
}: {
	kicker?: string;
	title: string;
	lead?: string;
	children: ReactNode;
}) {
	return (
		<PageRail className="pb-10 pt-8">
			<header className="mb-10 max-w-3xl">
				{kicker ? (
					<p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-eyebrow">
						{kicker}
					</p>
				) : null}
				<h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
				{lead ? <p className="mt-3 text-base leading-relaxed text-muted-foreground">{lead}</p> : null}
			</header>
			{children}
		</PageRail>
	);
}
