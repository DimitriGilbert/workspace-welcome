import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "@workspace-welcome/ui/components/button";
import { PageRail } from "@workspace-welcome/ui/components/page-rail";

import { seoHead } from "../seo";
import { THEME_SHOT, useDocsTheme } from "../theme";
import { CommandBlock, Terminal } from "../components/terminal";
import { FeedPreview, TriagePreview } from "../components/previews";

export const Route = createFileRoute("/")({
	component: HomePage,
	head: seoHead({
		title: "welcome-workspace",
		description:
			"A personal dashboard for your projects folder. Local: git state, stack, health, your GitHub items, one sqlite file. No accounts, no cloud.",
		path: "/",
	}),
});

/**
 * The hero capture: the ACTIVE identity's real board. The caption doubles
 * as the explanation of the site-wide picker.
 */
function HeroShot() {
	const { theme } = useDocsTheme();
	const shot = THEME_SHOT[theme];
	return (
		<figure className="min-w-0">
			<div className="overflow-hidden rounded-none ring-1 ring-foreground/10">
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
				My board today, a real capture. The{" "}
				<span className="font-mono uppercase tracking-[0.08em]">board</span> picker in the
				masthead re-skins this whole site with the app&apos;s own picker.
			</figcaption>
		</figure>
	);
}

/**
 * A section heading: mono caps over a hairline, alone.
 */
function Register({ children }: { children: string }) {
	return (
		<div className="flex items-baseline gap-4">
			<h2 className="shrink-0 font-mono text-[0.75rem] font-medium uppercase tracking-[0.14em] text-foreground">
				{children}
			</h2>
			<div aria-hidden="true" className="h-px min-w-8 flex-1 bg-gradient-to-r from-foreground/15 to-transparent" />
		</div>
	);
}

/** Prose column of a flow beat. */
function BeatProse({ children }: { children: ReactNode }) {
	return <div className="max-w-prose space-y-3 text-base leading-relaxed text-muted-foreground">{children}</div>;
}

/** A flow beat: prose beside whatever that step produces. `panelFirst`
 * mirrors the grid so beats alternate. */
function Beat({
	title,
	panelFirst = false,
	prose,
	panel,
}: {
	title: string;
	panelFirst?: boolean;
	prose: ReactNode;
	panel: ReactNode;
}) {
	return (
		<section>
			<Register>{title}</Register>
			<div
				className={`mt-5 grid gap-8 lg:items-start ${
					panelFirst
						? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
						: "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
				}`}
			>
				{panelFirst ? (
					<>
						{panel}
						{prose}
					</>
				) : (
					<>
						{prose}
						{panel}
					</>
				)}
			</div>
		</section>
	);
}

/** A ground-rules row: one flat claim, then the facts that make it true. */
function Rule({ claim, children }: { claim: string; children: ReactNode }) {
	return (
		<div className="grid gap-1.5 border-b border-foreground/10 py-4 last:border-b-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
			<dt className="font-mono text-[0.75rem] uppercase tracking-[0.08em] text-foreground">{claim}</dt>
			<dd className="text-base leading-relaxed text-muted-foreground">{children}</dd>
		</div>
	);
}

/** What one scan pass gathers for one project. */
const SCAN_READOUT = `~/workspace/kiln
  branch    forge-sqlite · 2 dirty
  last      2h ago
  remote    github.com:DimitriGilbert/kiln
  stack     node · pnpm
  alert     WRN stale-wip`;

function HomePage() {
	return (
		<PageRail className="pb-12 pt-8">
			{/* ---------------------------------------------------------- hero */}
			<section className="grid gap-10 border-b border-foreground/10 pb-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-14">
				<div>
					<h1 className="max-w-xl text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-[2.75rem]">
						A personal dashboard for your projects folder
					</h1>
					<p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
						A self-hosted welcome board, select any directory where your work lives and
						it&apos;ll track git state, the stack, your AI usage and much more.
					</p>
					<div className="mt-8 flex flex-wrap gap-2">
						<Button render={<Link to="/docs/getting-started" />}>Get it running</Button>
						<Button variant="outline" render={<Link to="/docs/concepts" />}>
							How it works
						</Button>
					</div>
				</div>

				<HeroShot />
			</section>

			{/* ------------------------------------------------- the flow
			    Each beat is a step of running the app; the companion is
			    what that step produces. */}
			<div className="mt-14 space-y-14">
				<Beat
					title="You add the folder"
					prose={
						<BeatProse>
							<p>
								Its immediate subdirectories become the projects, no recursion; the
								scanner reads them and never writes into your repos.
							</p>
							<p>
								A per-project fingerprint (directory mtime,{" "}
								<code className="text-foreground">.git/HEAD</code>,{" "}
								<code className="text-foreground">.git/index</code>, a{" "}
								<code className="text-foreground">git status --porcelain</code> hash)
								means a warm rescan re-reads only what moved.
							</p>
						</BeatProse>
					}
					panel={
						<Terminal label="one scan pass" trailing="read-only">
							{SCAN_READOUT}
						</Terminal>
					}
				/>

				<Beat
					title="The board fills in"
					panelFirst
					prose={
						<BeatProse>
							<p>
								Every project carries a recency LED that cools over roughly 90 days. The
								git state turns into seven health alerts (diverged, no-remote, unpushed,
								dirty, stale-wip, behind, dormant) with the loud ones rolled to the top.
							</p>
							<p>
								Press <code className="text-foreground">/</code> anywhere to filter by
								name, path, stack, branch, remote, or a note you left yourself.
							</p>
						</BeatProse>
					}
					panel={<TriagePreview />}
				/>

				<Beat
					title="Your forge work joins the board"
					prose={
						<BeatProse>
							<p>
								Repos with a GitHub remote bring their open issues and PRs along, and the
								feed pulls yours from every repo, workspace or not. The fetch runs through
								your own <code className="text-foreground">gh</code> CLI when you press
								Sync (five-minute floor per repo, one fetch at a time) and lands as a
								sqlite snapshot, so rendering never spends your rate limit.
							</p>
						</BeatProse>
					}
					panel={<FeedPreview />}
				/>

				<Beat
					title="Open a project"
					panelFirst
					prose={
						<BeatProse>
							<p>
								Any project opens into its own page: a note field for where you left off,
								fetch / pull / push, a branch switcher that probes before it clobbers
								anything, a file browser that cannot escape the project folder, build
								artifacts, an AI interview that writes a PRD and plan into{" "}
								<code className="text-foreground">docs/</code>, and a browser IDE.
							</p>
						</BeatProse>
					}
					panel={
						<figure className="min-w-0">
							<div className="overflow-hidden rounded-none ring-1 ring-foreground/10">
								<img
									src="/shot-project.png"
									alt="A project page: git actions band, health and activity panels, commit log, and the files / artifacts / ideation tabs"
									className="block h-auto w-full bg-card"
									width={1440}
									height={728}
									loading="lazy"
								/>
							</div>
							<figcaption className="mt-2 text-[0.7rem] text-muted-foreground">
								One of mine, same folder one level down.
							</figcaption>
						</figure>
					}
				/>
			</div>

			{/* ------------------------------------------------ ground rules */}
			<section className="mt-14 border-t border-foreground/10 pt-10">
				<Register>Ground rules</Register>
				<dl className="mt-4 border-t border-foreground/10">
					<Rule claim="Local">
						Everything the app remembers sits in one sqlite file under your XDG data dir.
						No accounts, no cloud.
					</Rule>
					<Rule claim="Your own gh">
						The only network the app does is forge sync, through the GitHub CLI you are
						already logged into. No embedded tokens, no proxy.
					</Rule>
					<Rule claim="Sync is a button">
						Nothing polls or fetches on page load, and the server enforces the five-minute
						floor even if you hammer it.
					</Rule>
					<Rule claim="No fake numbers">
						Counts render as{" "}
						<span className="font-mono text-foreground">50+</span> at the page cap,{" "}
						<span className="text-foreground">Never synced</span> before the first sync,{" "}
						<span className="font-mono text-foreground">stale</span> after an hour. A repo
						with no data never renders as an empty one.
					</Rule>
					<Rule claim="The board keeps growing">
						Panels ship over time; the ones you have drag, resize, and shed, and the
						arrangement persists.
					</Rule>
				</dl>
			</section>

			{/* --------------------------------------------------- captures */}
			<section className="mt-14 border-t border-foreground/10 pt-10">
				<Register>Mine, today</Register>
				<p className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground">
					I built this for a folder of thirty-odd repos, half of them with weeks-old
					uncommitted changes and three with no remote.
				</p>
				<p className="mt-3 max-w-prose text-base leading-relaxed text-muted-foreground">
					These are my real boards: I keep{" "}
					<span className="text-foreground">mission-control</span> on dark,{" "}
					<span className="text-foreground">bento</span> is the loose grid,{" "}
					<span className="text-foreground">meadow</span> is the daylight scheme. Yours will
					carry your projects, arranged your way.
				</p>
				<div className="mt-6 grid gap-3 sm:grid-cols-3">
					{(["mission-control", "bento", "meadow"] as const).map((id) => (
						<Link
							key={id}
							to="/features"
							hash="boards"
							className="group block min-w-0 border border-foreground/10 p-1.5 transition-colors hover:border-foreground/25"
						>
							<img
								src={THEME_SHOT[id].src}
								alt=""
								aria-hidden="true"
								className="block h-16 w-full bg-card object-cover object-top"
								loading="lazy"
							/>
							<span className="mt-2 block px-0.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground group-hover:text-foreground">
								{id}
							</span>
						</Link>
					))}
				</div>
			</section>

			{/* ------------------------------------------------------- install */}
			<section className="mt-14 border-t border-foreground/10 pt-10">
				<Register>Install</Register>
				<div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center">
					<CommandBlock command="curl -fsSL https://welcome-workspace.dbuild.dev/install.sh | sh" />
					<div>
						<p className="max-w-prose text-base leading-relaxed text-muted-foreground">
							Node 22+, <code className="text-foreground">git</code>, and{" "}
							<code className="text-foreground">curl</code> or{" "}
							<code className="text-foreground">wget</code>. The script verifies the
							download against the release&apos;s{" "}
							<code className="text-foreground">SHA256SUMS.txt</code>, installs to{" "}
							<code className="text-foreground">~/.local/share/workspace-welcome</code>,
							and starts a systemd user service on Linux;{" "}
							<a
								href="https://github.com/DimitriGilbert/workspace-welcome/blob/main/scripts/install.sh"
								target="_blank"
								rel="noreferrer"
								className="text-foreground underline underline-offset-4"
							>
								read it first
							</a>{" "}
							if that is your habit.
						</p>
						<div className="mt-4 flex flex-wrap gap-2">
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
					</div>
				</div>
			</section>
		</PageRail>
	);
}
