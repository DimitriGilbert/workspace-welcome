import { useState } from "react";
import type { ReactNode } from "react";
import { CircleDot, GitBranch, GitPullRequest, RefreshCw } from "lucide-react";

import { Card } from "@workspace-welcome/ui/components/card";
import { Chip } from "@workspace-welcome/ui/components/chip";
import { Stat } from "@workspace-welcome/ui/components/stat";
import { WidgetTabs } from "@workspace-welcome/ui/components/widget-tabs";
import { TONE_TOKEN, type Tone } from "@workspace-welcome/ui/lib/tokens";
import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Product previews: sample boards rendered from the SAME ui parts the app
 * renders, so the docs site is a live preview of the dashboard's surfaces.
 * Everything inside a preview is illustrative sample data (the screens'
 * real captures live beside them); the `inert` root keeps sample buttons
 * out of the tab order and screen-reader flow, and the visible caption
 * says the data is a sample. No new design vocabulary: Card, Chip, Stat,
 * WidgetTabs, token colors only.
 */

/** Frame every sample board shares: caption line + the card itself. */
function PreviewFrame({
	label,
	caption,
	children,
	className,
}: {
	label: string;
	caption: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<figure className={cn("min-w-0", className)}>
			<div inert className="overflow-hidden rounded-none ring-1 ring-foreground/10">
				{children}
			</div>
			<figcaption className="mt-2 flex flex-wrap items-center gap-x-2 text-[0.7rem] text-muted-foreground">
				<span className="font-mono uppercase tracking-[0.08em] text-eyebrow">{label}</span>
				<span aria-hidden="true" className="text-muted-foreground/50">
					·
				</span>
				<span>{caption}</span>
			</figcaption>
		</figure>
	);
}

/** The widget-shell header idiom: quiet label + trailing meta. */
function BoardHeader({
	title,
	trailing,
}: {
	title: string;
	trailing?: ReactNode;
}) {
	return (
		<div className="flex shrink-0 items-center gap-2 border-b border-foreground/10 px-3 py-2">
			<span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
				<span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--pinned-accent)" />
				<span className="truncate">{title}</span>
			</span>
			{trailing ? (
				<div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div>
			) : null}
		</div>
	);
}

const FEED_ROWS = [
	{
		kind: "pr" as const,
		number: 142,
		title: "Shed-order guard keeps the ledger a table at every width",
		repo: "acme/kiln",
		when: "2h ago",
		labels: "ledger",
	},
	{
		kind: "issue" as const,
		number: 45,
		title: "Report MISSING state should link to the generator",
		repo: "acme/gitsnitch",
		when: "5h ago",
		labels: null,
	},
	{
		kind: "pr" as const,
		number: 139,
		title: "Ideation: persist the interview under .ideadump/",
		repo: "acme/kiln",
		when: "yesterday",
		labels: "ideation",
	},
	{
		kind: "pr" as const,
		number: 136,
		title: "Feed rows carry owner/repo attribution",
		repo: "acme/forge",
		when: "yesterday",
		labels: null,
	},
	{
		kind: "issue" as const,
		number: 31,
		title: "Pinned vitals count drifts after a hide",
		repo: "acme/kiln",
		when: "2d ago",
		labels: "triage",
	},
	{
		kind: "issue" as const,
		number: 12,
		title: "Meadow digests: momentum + rhythm bands",
		repo: "acme/meadow",
		when: "6d ago",
		labels: null,
	},
];

/** The dashboard's cross-repo feed widget, with sample rows. */
export function FeedPreview({ className }: { className?: string }) {
	return (
		<PreviewFrame
			label="forge feed"
			caption="sample rows, the real feed lists your open items, workspace repo or not"
			className={className}
		>
			<Card size="sm" className="gap-0 py-0">
				<BoardHeader
					title="My issues & pull requests"
					trailing={
						<>
							<span className="font-mono text-[10px] tabular-nums text-muted-foreground">
								50+ · 11:31
							</span>
							<span className="inline-flex h-6 items-center gap-1 rounded-none border border-input px-2 text-[10px] text-muted-foreground">
								<RefreshCw aria-hidden="true" className="size-2.5" />
								Sync
							</span>
						</>
					}
				/>
				<ul className="divide-y divide-foreground/[0.06]">
					{FEED_ROWS.map((row) => (
						<li
							key={row.number}
							className="flex min-w-0 items-start gap-2 px-3 py-1.5"
						>
							{row.kind === "pr" ? (
								<GitPullRequest aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
							) : (
								<CircleDot aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
							)}
							<span className="shrink-0 pt-px font-mono text-[10px] tabular-nums text-muted-foreground">
								#{row.number}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-xs font-medium leading-tight">
									{row.title}
								</span>
								<span className="flex min-w-0 items-center gap-1.5 text-[10px] leading-4 text-muted-foreground">
									<span className="truncate">{row.repo}</span>
									{row.labels ? <span className="truncate">{row.labels}</span> : null}
								</span>
							</span>
							<span className="shrink-0 pt-px font-mono text-[10px] tabular-nums text-muted-foreground">
								{row.when}
							</span>
						</li>
					))}
				</ul>
				<div className="border-t border-foreground/10 px-3 py-1.5">
					<p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
						50+ shown, a list hit the page limit
					</p>
				</div>
			</Card>
		</PreviewFrame>
	);
}

const LEDGER_ROWS = [
	{ name: "kiln", issues: 0, pulls: 1, when: "5m ago", fresh: true },
	{ name: "anvil", issues: 2, pulls: 3, when: "1h ago", fresh: true },
	{ name: "crucible", issues: 1, pulls: 0, when: "1d ago", fresh: true },
	{ name: "bellows", issues: 0, pulls: 2, when: "2d ago", fresh: false },
	{ name: "quench", issues: 4, pulls: 12, when: "6d ago", fresh: false },
	{ name: "slag", issues: 0, pulls: 0, when: "24d ago", fresh: false },
];

/**
 * The fleet ledger's reading grid: project rows with forge count chips
 * beside the recency LED: the columns mission-control never sheds.
 */
export function LedgerPreview({ className }: { className?: string }) {
	return (
		<PreviewFrame
			label="fleet ledger"
			caption="sample rows, the real table sheds columns, never the table form"
			className={className}
		>
			<Card size="sm" className="gap-0 py-0">
				<BoardHeader title="Fleet · 33 of 33 projects" />
				<table className="w-full text-left text-xs">
					<thead>
						<tr className="border-b border-foreground/10 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
							<th scope="col" className="px-3 py-1.5 font-medium">
								Project
							</th>
							<th scope="col" className="px-3 py-1.5 text-right font-medium">
								I/P
							</th>
							<th scope="col" className="px-3 py-1.5 text-right font-medium">
								Updated
							</th>
						</tr>
					</thead>
					<tbody>
						{LEDGER_ROWS.map((row) => (
							<tr key={row.name} className="border-b border-foreground/[0.06] last:border-0">
								<td className="px-3 py-1.5">
									<span className="flex items-center gap-2">
										<span
											aria-hidden="true"
											className="size-1.5 shrink-0 rounded-full"
											style={{
												backgroundColor: row.fresh
													? "var(--recency-fresh)"
													: "var(--recency-stale)",
											}}
										/>
										<span className="truncate font-medium">{row.name}</span>
									</span>
								</td>
								<td className="px-3 py-1.5 text-right">
									<span className="inline-flex items-center gap-1">
										<Chip tone="info" className="gap-0.5 px-1.5 py-0 text-[10px]">
											<CircleDot aria-hidden="true" className="size-2.5" />
											{row.issues}
										</Chip>
										<Chip tone="info" className="gap-0.5 px-1.5 py-0 text-[10px]">
											<GitPullRequest aria-hidden="true" className="size-2.5" />
											{row.pulls}
										</Chip>
									</span>
								</td>
								<td className="px-3 py-1.5 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
									{row.when}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</Card>
		</PreviewFrame>
	);
}

/** Forge chips beside git chips: the app's project-list idiom. */
export function ForgeChipsRow() {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs">
			<span className="font-medium text-foreground">kiln</span>
			<span className="inline-flex items-center gap-1 text-muted-foreground">
				<GitBranch aria-hidden="true" className="size-3" />
				forge-sqlite
			</span>
			<Chip tone="warning" className="px-1.5 py-0 text-[10px]">
				16 dirty
			</Chip>
			<Chip tone="info" className="gap-0.5 px-1.5 py-0 text-[10px]">
				<CircleDot aria-hidden="true" className="size-2.5" />
				2
			</Chip>
			<Chip tone="info" className="gap-0.5 px-1.5 py-0 text-[10px]">
				<GitPullRequest aria-hidden="true" className="size-2.5" />
				1
			</Chip>
			<span className="text-[0.7rem] text-muted-foreground">
				issue / PR counts from the cached snapshot, never a fabricated zero
			</span>
		</div>
	);
}

const PULSE_TABS = [
	{ id: "activity", label: "Activity" },
	{ id: "health", label: "Health" },
	{ id: "code", label: "Code" },
	{ id: "ai", label: "AI usage" },
];

interface PulseItem {
	label: string;
	value: string;
	tone?: "warning" | "info" | "positive";
}

const PULSE_PANELS: Record<string, { items: PulseItem[] }> = {
	activity: {
		items: [
			{ label: "commits", value: "5,004" },
			{ label: "contributors", value: "49" },
			{ label: "repos", value: "32" },
			{ label: "peak month", value: "933", tone: "positive" },
		],
	},
	health: {
		items: [
			{ label: "errors", value: "0", tone: "positive" },
			{ label: "warnings", value: "18", tone: "warning" },
			{ label: "info", value: "32", tone: "info" },
			{ label: "alerts of 33 projects", value: "18" },
		],
	},
	code: {
		items: [
			{ label: "lines", value: "1.37M" },
			{ label: "files", value: "15,300" },
			{ label: "languages", value: "9" },
			{ label: "untyped", value: "1%", tone: "positive" },
		],
	},
	ai: {
		items: [
			{ label: "est. cost", value: "$2,158.08", tone: "warning" },
			{ label: "tokens / day", value: "34.6M" },
			{ label: "models", value: "7" },
			{ label: "unsubsidized", value: "100%" },
		],
	},
};

/**
 * The report digests band (workspace pulse): real WidgetTabs over real
 * Stats, sample numbers. Tabs genuinely switch: the same interaction the
 * dashboard renders.
 */
export function PulsePreview({ className }: { className?: string }) {
	const [active, setActive] = useState("activity");
	const panel = PULSE_PANELS[active] ?? PULSE_PANELS.activity;
	return (
		<PreviewFrame
			label="workspace pulse"
			caption="sample digest, the boards embed the report's activity, health, code, and AI usage"
			className={className}
		>
			<Card size="sm" className="gap-0 py-0">
				<BoardHeader
					title="generated 23h ago"
					trailing={
						<WidgetTabs
							tabs={PULSE_TABS}
							active={active}
							onChange={setActive}
							size="sm"
							ariaLabel="Report digest"
						/>
					}
				/>
				<div className="grid grid-cols-2 gap-x-4 gap-y-4 px-3 py-4 sm:grid-cols-4">
					{panel.items.map((item) => (
						<Stat
							key={item.label}
							label={item.label}
							value={item.value}
							tone={item.tone}
							size="sm"
						/>
					))}
				</div>
			</Card>
		</PreviewFrame>
	);
}

/** The project surface's tab vocabulary, live. */
export function ProjectTabsPreview() {
	const TABS = [
		{ id: "files", label: "files" },
		{ id: "artifacts", label: "artifacts" },
		{ id: "ideation", label: "ideation" },
	];
	const [active, setActive] = useState("files");
	return (
		<div className="flex min-w-0 items-center gap-3">
			<WidgetTabs tabs={TABS} active={active} onChange={setActive} ariaLabel="Project surface" />
			<p className="min-w-0 truncate text-xs text-muted-foreground">
				{active === "files"
					? "Confined file browser, the server rejects path escapes"
					: active === "artifacts"
						? "Build/test screenshots & videos from configured folders"
						: "AI interview that writes a PRD + plan into the project's docs/"}
			</p>
		</div>
	);
}

interface TriageRow {
	tone: Tone;
	tag: string;
	name: string;
	message: string;
	branch: string;
	gitGlyphs: string;
	when: string;
}

/**
 * Sample triage rows over the scan's REAL alert vocabulary (the seven
 * codes the scanner emits; see docs/concepts). Names are invented, the
 * alert texts are the scanner's verbatim messages.
 */
const TRIAGE_ROWS: TriageRow[] = [
	{
		tone: "critical",
		tag: "ERR",
		name: "keystone",
		message: "Diverged: 4 ahead, 2 behind",
		branch: "main",
		gitGlyphs: "4 dirty",
		when: "2 days ago",
	},
	{
		tone: "warning",
		tag: "WRN",
		name: "slopcad",
		message: "No remote configured",
		branch: "main",
		gitGlyphs: "4 dirty",
		when: "22 hours ago",
	},
	{
		tone: "warning",
		tag: "WRN",
		name: "stationio",
		message: "Uncommitted changes sitting for 3+ weeks",
		branch: "main",
		gitGlyphs: "1 dirty",
		when: "10 days ago",
	},
	{
		tone: "info",
		tag: "INF",
		name: "docs-dgaf",
		message: "No activity in 90+ days",
		branch: "main",
		gitGlyphs: "",
		when: "4 months ago",
	},
];

/**
 * The triage register: mission-control's needs-attention list. Same shape
 * the app renders: severity tag, project, the scanner's own alert text,
 * branch, git glyphs, last touch. Inert sample data, honestly captioned.
 */
export function TriagePreview({ className }: { className?: string }) {
	return (
		<PreviewFrame
			label="triage"
			caption="sample rows, the alert texts are the scanner's verbatim messages"
			className={className}
		>
			<Card size="sm" className="gap-0 py-0">
				<BoardHeader title="Needs attention · 4 of 33 projects" />
				<ul className="divide-y divide-foreground/[0.06]">
					{TRIAGE_ROWS.map((row) => (
						<li key={row.name} className="flex min-w-0 items-center gap-2.5 px-3 py-2">
							<span
								className="w-7 shrink-0 font-mono text-[10px] font-medium tracking-[0.08em]"
								style={{ color: TONE_TOKEN[row.tone] }}
							>
								{row.tag}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-xs font-medium leading-tight">{row.name}</span>
								<span className="block truncate text-[10px] leading-4 text-muted-foreground">
									{row.message}
								</span>
							</span>
							<span className="hidden shrink-0 items-center gap-2 font-mono text-[10px] text-muted-foreground sm:inline-flex">
								<GitBranch aria-hidden="true" className="size-3" />
								{row.branch}
							</span>
							{row.gitGlyphs ? (
								<Chip tone="warning" className="shrink-0 px-1.5 py-0 text-[10px]">
									{row.gitGlyphs}
								</Chip>
							) : null}
							<span className="w-20 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
								{row.when}
							</span>
						</li>
					))}
				</ul>
			</Card>
		</PreviewFrame>
	);
}
