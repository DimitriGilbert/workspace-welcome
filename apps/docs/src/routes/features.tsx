import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@workspace-welcome/ui/components/button";
import { SectionHeader } from "@workspace-welcome/ui/components/section-header";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { PageShell } from "../components/page-shell";
import {
	FeedPreview,
	ForgeChipsRow,
	LedgerPreview,
	ProjectTabsPreview,
	PulsePreview,
} from "../components/previews";
import { seoHead } from "../seo";
import { DOCS_THEMES, THEME_SHOT } from "../theme";
import type { DocsThemeId } from "../theme";

export const Route = createFileRoute("/features")({
	component: FeaturesPage,
	head: seoHead({
		title: "Features — welcome-workspace",
		description:
			"Not a collaboration cloud. A dashboard for your disk — scan, triage, your GitHub issues and PRs, scaffold, report.",
		path: "/features",
	}),
});

const sections = [
	{
		id: "dashboard",
		title: "Dashboard boards & health",
		paragraphs: [
			"You add roots — directories whose immediate children become projects. The scan fingerprints each one so warm reloads only re-scan what actually moved. On a large workspace that is the difference between usable and coffee-break.",
			"Every project gets dates, stack detection, branch / ahead-behind / dirty / last commit / remote, and health alerts: no remote, diverged, behind, unpushed, dirty, stale WIP (dirty and quiet for 3+ weeks), dormant (90+ days).",
			"The dashboard itself is a widget board in one of three themes — bento (mosaic + workspace pulse), meadow (mosaic + workspace digests), mission-control (fleet ledger table, triage board, vitals) — each with a light and a dark scheme. Pick one in the header; the choice persists.",
		],
		bullets: [
			"Attention surfaces roll up warn/error and fold away when empty; mission-control's triage board also flags your feed's PRs untouched for 30+ days",
			"Pins and recency heat over about 90 days, on every board",
			"Filter with / across name, path, stack, branch, remote, note",
		],
	},
	{
		id: "forge",
		title: "Forge — your issues & pull requests",
		paragraphs: [
			"The forge layer surfaces your open GitHub items without a rate-limit incident. The dashboard carries a cross-repo feed — the signed-in account's open issues and pull requests across every GitHub repository, workspace or not. Project surfaces get count chips beside the git chips, sourced from the repo's cached snapshot or (honestly labeled) from your feed — never a fabricated zero.",
			"The project page has a per-repo board with review-decision badges and label filters. Nothing auto-syncs: data appears when you press Sync, the server enforces a minimum interval, dedupes in-flight work, and runs one fetch at a time through your own gh CLI. Reads come from the local database only.",
			"GitHub today via the gh CLI adapter; the adapter contract leaves room for Gitea and GitLab. A list that hit the page limit says 50+, never a false exact count.",
		],
		bullets: [
			"Settings → Forge: every mapped repo with cached counts, per-repo Sync, and Sync all",
			"Failed syncs keep the last good snapshot and surface the error",
			"Unsynced repos show a Sync button, never an empty-looking lie",
		],
	},
	{
		id: "project",
		title: "Project workspace",
		paragraphs: [
			"Open a project and you get the day-to-day surface: vitals, a note field for where you left off (the feature I actually use), remote deep links for GitHub / GitLab / Bitbucket / Codeberg / sourcehut, and git actions with a safety probe when switching branches.",
			"The tabbed surface covers files, artifacts, and ideation: a confined file browser, the project's build/test screenshots and videos from its configured artifact folders, and an AI interview that grills an idea one question at a time then writes a PRD and plan into the project's docs/.",
		],
		bullets: [
			"Fetch all, pull ff-only, push with upstream",
			"Branch switcher and read-only commit history",
			"The project's Issues & PRs board (see Forge)",
			"Quick-open editor, terminal, or folder — editor is configurable; terminal auto-detects common Linux terminals if you leave it blank",
		],
	},
	{
		id: "reports",
		title: "git-snitch reports",
		paragraphs: [
			"The project page can run a per-repo report; Settings can run a comparative scan across a whole root. HTML is cached under XDG and served at /reports/<key>, so it opens in a new tab from whatever machine is hitting the app. The boards also embed the report's digests — activity, health, code mix, AI usage.",
			"CLI resolution is Settings path, then a local gitsnitch build, then npx as fallback.",
		],
		bullets: [],
	},
	{
		id: "files-ide",
		title: "Files & browser IDE",
		paragraphs: [
			"A lazy file tree stays confined to the project subtree — the server rejects path escapes. Upload (10 MB a file, overwrite confirm), rename, new folder, download, delete. Trash via gio when available; otherwise permanent delete behind the same confirmation.",
			"Open IDE starts a shared code-server instance deep-linked to that folder. First use installs into XDG data. Stop it from Settings. URLs use the hostname you are already browsing — fine on a trusted LAN, not something to hang on the public internet with --auth none.",
		],
		bullets: [],
	},
	{
		id: "create-clone",
		title: "Create & clone",
		paragraphs: [
			"Create project scaffolds better-t-stack into a chosen root: stack options with compatibility-aware lists, progress, optional install, and AGENTS.md when the file is not already there.",
			"Clone script builds a portable bash script from selected remotes — force SSH, skip existing dirs, dedupe. Copy or download it; you run it locally. The app does not clone for you.",
		],
		bullets: [],
	},
] as const;

/**
 * The three boards' real captures — the active one large, the other two a
 * click away. Site theme and this switcher are independent on purpose: this
 * panel is the survey of what the app ships.
 */
function ThemeShots() {
	const [active, setActive] = useState<DocsThemeId>("mission-control");
	return (
		<figure className="mt-8">
			<div className="overflow-hidden rounded-none ring-1 ring-foreground/10">
				<img
					key={active}
					src={THEME_SHOT[active].src}
					alt={THEME_SHOT[active].alt}
					className="block h-auto w-full bg-card"
					width={1440}
					height={728}
				/>
			</div>
			<div className="mt-2 flex flex-wrap items-stretch gap-2">
				{DOCS_THEMES.map((theme) => (
					<button
						key={theme.id}
						type="button"
						onClick={() => setActive(theme.id)}
						aria-pressed={active === theme.id}
						className={cn(
							"group flex min-w-0 items-center gap-2 rounded-none border p-1.5 text-left transition-colors",
							active === theme.id
								? "border-primary/60 bg-card"
								: "border-foreground/10 hover:border-foreground/25",
						)}
					>
						<img
							src={THEME_SHOT[theme.id].src}
							alt=""
							aria-hidden="true"
							className="h-10 w-[72px] shrink-0 bg-card object-cover object-top"
							loading="lazy"
						/>
						<span
							className={cn(
								"pr-1 font-mono text-[0.7rem] uppercase tracking-[0.08em]",
								active === theme.id ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{theme.label}
						</span>
					</button>
				))}
				<figcaption className="ml-auto hidden self-center text-[0.7rem] text-muted-foreground sm:block">
					Real captures — switch boards in the app header, light &amp; dark schemes included.
				</figcaption>
			</div>
		</figure>
	);
}

function FeaturesPage() {
	return (
		<PageShell
			kicker="features"
			title="What it does"
			lead="Not a collaboration cloud. A dashboard for your disk — scan, triage, your GitHub issues and PRs, scaffold, report."
		>
			<nav aria-label="Sections" className="mb-12 flex flex-wrap gap-2">
				{sections.map((section) => (
					<a
						key={section.id}
						href={`#${section.id}`}
						className="border border-foreground/10 px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
					>
						{section.title}
					</a>
				))}
			</nav>

			<div className="space-y-16">
				{sections.map((section) => (
					<section key={section.id} id={section.id} className="scroll-mt-24">
						<SectionHeader title={section.title} />
						<div className="mt-4 max-w-3xl space-y-4">
							{section.paragraphs.map((paragraph) => (
								<p key={paragraph.slice(0, 32)} className="text-base leading-relaxed text-muted-foreground">
									{paragraph}
								</p>
							))}
							{section.bullets.length > 0 ? (
								<ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground">
									{section.bullets.map((bullet) => (
										<li key={bullet}>{bullet}</li>
									))}
								</ul>
							) : null}
						</div>

						{section.id === "dashboard" ? <ThemeShots /> : null}
						{section.id === "forge" ? (
							<div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
								<FeedPreview />
								<div className="flex min-w-0 flex-col gap-5">
									<LedgerPreview />
									<ForgeChipsRow />
								</div>
							</div>
						) : null}
						{section.id === "project" ? (
							<div className="mt-8">
								<figure className="overflow-hidden rounded-none ring-1 ring-foreground/10">
									<img
										src="/shot-project.png"
										alt="A project page on the mission-control board: git actions, health, activity, code mix, commit log, and the files / artifacts / ideation tabs"
										className="block h-auto w-full bg-card"
										width={1440}
										height={728}
									/>
								</figure>
								<div className="mt-4">
									<ProjectTabsPreview />
								</div>
							</div>
						) : null}
						{section.id === "reports" ? <PulsePreview className="mt-8 max-w-3xl" /> : null}
					</section>
				))}
			</div>

			<div className="mt-14 flex flex-wrap gap-2 border-t border-foreground/10 pt-8">
				<Button render={<Link to="/docs/getting-started" />}>Install</Button>
				<Button variant="outline" render={<Link to="/docs/concepts" />}>
					Concepts
				</Button>
			</div>
		</PageShell>
	);
}
