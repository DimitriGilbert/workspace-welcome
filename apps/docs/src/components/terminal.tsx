import type { ReactNode } from "react";

import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Terminal: a labeled command/script block. The docs-site rendering of the
 * app's mono register idiom: a quiet header bar (tool + trailing glyph) over
 * a mono body. Used for shell commands, generated scripts, and file paths;
 * the label names WHAT produced the text so a block is never anonymous.
 * Capped at the docs reading measure by default so a one-line command never
 * stretches the full rail while the prose around it wraps narrow.
 */
export function Terminal({
	label,
	trailing,
	children,
	className,
}: {
	label: string;
	trailing?: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<figure className={cn("min-w-0 max-w-3xl", className)}>
			<div className="overflow-hidden rounded-none ring-1 ring-foreground/10">
				<div className="flex items-center justify-between gap-3 border-b border-foreground/10 bg-card px-3 py-1.5">
					<span className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-eyebrow">
						{label}
					</span>
					{trailing ? (
						<span aria-hidden="true" className="font-mono text-[0.65rem] text-muted-foreground/50">
							{trailing}
						</span>
					) : null}
				</div>
				<pre className="overflow-x-auto bg-card/40 p-4 font-mono text-[0.8rem] leading-relaxed text-foreground">
					{children}
				</pre>
			</div>
		</figure>
	);
}

/** A shell command on one line, rendered through Terminal. */
export function CommandBlock({
	command,
	label = "sh",
	className,
}: {
	command: string;
	label?: string;
	className?: string;
}) {
	return (
		<Terminal label={label} trailing="$" className={className}>
			{command}
		</Terminal>
	);
}
