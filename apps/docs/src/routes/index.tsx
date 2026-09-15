import { Link, createFileRoute } from "@tanstack/react-router";
import { FolderGit2, Gauge, GitPullRequest, Hammer, LayoutDashboard } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace-welcome/ui/components/card";
import { PageRail } from "@workspace-welcome/ui/components/page-rail";
import { SectionHeader } from "@workspace-welcome/ui/components/section-header";

import { seoHead } from "../seo";
import { THEME_SHOT, useDocsTheme } from "../theme";

export const Route = createFileRoute("/")({
	component: HomePage,
	head: seoHead({
		title: "welcome-workspace",
		description:
			"A local dashboard for people with too many projects. Scans git, stack, and health. No accounts, no cloud.",
		path: "/",
	}),
});

/** The hero capture — the ACTIVE identity's real dashboard. */
function HeroShot() {
	const { theme } = useDocsTheme();
	const shot = THEME_SHOT[theme];
	return (
		<figure className="min-w-0">
			<div className="overflow-hidden rounded-none ring-1 ring-foreground/10">
				<div className="flex items-center justify-between gap-3 border-b border-foreground/10 bg-card px-3 py-1.5">
					<span className="truncate font-mono text-[0.7rem] uppercase tracking-[0.08em] text-eyebrow">
						workspace-welcome / {theme}
					</span>
					<span className="hidden shrink-0 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground sm:inline">
						synced just now
					</span>
				</div>
				<img
					key={shot.src}
					src={shot.src}
					alt={shot.alt}
					className="block h-auto w-full bg-card"
					width={1440}
					height={728}
				/>
			</div>
			<figcaption className="mt-2 text-[0.7rem] text-muted-foreground">
				The real {theme} board — the <span className="font-mono uppercase tracking-[0.08em]">board</span>{" "}
				picker in the masthead switches this whole site, exactly like the app&apos;s theme picker.
			</figcaption>
		</figure>
	);
}

const GETS = [
	{
		icon: Gauge,
		title: "Health that rolls up.",
		body: "Dirty trees, diverged branches, behind remotes, stale WIP, dormant repos. Each board keeps the warn/error stuff where you can act on it.",
	},
	{
		icon: GitPullRequest,
		title: "Your issues and pull requests.",
		body: "A cross-repo feed of your open GitHub items on the dashboard, count chips on project surfaces, and a per-repo board with review decisions and label filters. Sync is explicit — nothing polls, nothing auto-fetches.",
	},
	{
		icon: LayoutDashboard,
		title: "Three dashboard boards.",
		body: "Bento, meadow, or mission-control — each with a light and a dark scheme — from a mosaic with workspace digests to a fleet ledger table and a triage board that flags PRs sitting untouched 30+ days.",
	},
	{
		icon: FolderGit2,
		title: "A real project page.",
		body: "Notes for where you left off, fetch/pull/push, a confined file browser, build artifacts, an AI ideation interview, git-snitch reports, open in editor/terminal, or a browser IDE.",
	},
	{
		icon: Hammer,
		title: "Scaffolding when you need a new one.",
		body: "Create a better-t-stack project into a tracked root, or export a clone script for the next machine.",
	},
] as const;

function HomePage() {
	return (
		<PageRail className="pb-12 pt-8">
			<section className="grid gap-10 border-b border-foreground/10 pb-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-14">
				<div>
					<p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-eyebrow">
						local-first project dashboard
					</p>
					<h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-[2.75rem]">
						A local dashboard for people with too many projects
					</h1>
					<p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
						Point it at the folders where your projects live. It scans them, figures out the git state, guesses
						the stack, and gives you one screen for the Monday-morning question: what was I doing, and
						what&apos;s falling apart?
					</p>
					<p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
						No accounts, no cloud. It runs on your machine, reads your filesystem, and keeps its
						state in a local sqlite database that never leaves the box.
					</p>
					<div className="mt-8 flex flex-wrap gap-2">
						<Button render={<Link to="/docs/getting-started" />}>Get it running</Button>
						<Button variant="outline" render={<Link to="/features" />}>
							What it does
						</Button>
					</div>
				</div>

				<HeroShot />
			</section>

			<section className="mt-14">
				<SectionHeader
					title="What you get"
					trailing={
						<Button
							variant="ghost"
							size="sm"
							className="text-muted-foreground"
							render={<Link to="/features" />}
						>
							Everything it does
						</Button>
					}
				/>
				<div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
					{GETS.map((item, index) => (
						<Card
							key={item.title}
							size="sm"
							className={index < 3 ? "lg:col-span-2" : "lg:col-span-3"}
						>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<item.icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
									{item.title}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<CardDescription className="text-[0.8rem]/relaxed">{item.body}</CardDescription>
							</CardContent>
						</Card>
					))}
				</div>
			</section>

			<section className="mt-14 border-t border-foreground/10 pt-10">
				<SectionHeader title="Why it exists" />
				<p className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground">
					My projects folder was a mess. Twenty-odd repos, half with uncommitted changes rotting for weeks,
					three with no remote, one I hadn&apos;t touched in a year. The folder view told me none of that. I
					wanted a screen that surfaced the stale WIP and the diverged branches without{" "}
					<code className="text-foreground">cd</code>-ing into each one for{" "}
					<code className="text-foreground">git status</code>.
				</p>
			</section>

			<section className="mt-14 flex flex-col gap-4 border-t border-foreground/10 pt-10 sm:flex-row sm:items-center sm:justify-between">
				<p className="max-w-xl text-base text-muted-foreground">
					Node 22+ and git — one curl command installs the rest. Optional <code className="text-foreground">gio</code> for trash. First IDE open
					downloads code-server once.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button render={<Link to="/docs/getting-started" />}>Install notes</Button>
					<Button
						variant="outline"
						render={
							<a href="https://github.com/DimitriGilbert/workspace-welcome" target="_blank" rel="noreferrer" />
						}
					>
						Source
					</Button>
				</div>
			</section>
		</PageRail>
	);
}
