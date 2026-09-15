import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@workspace-welcome/ui/components/button";
import { SectionHeader } from "@workspace-welcome/ui/components/section-header";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { PageShell } from "../components/page-shell";
import {
	FeedPreview,
	ForgeChipsRow,
	ProjectTabsPreview,
	PulsePreview,
	TriagePreview,
} from "../components/previews";
import { seoHead } from "../seo";
import { Terminal } from "../components/terminal";
import { DOCS_THEMES, THEME_SHOT } from "../theme";
import type { DocsThemeId } from "../theme";

export const Route = createFileRoute("/features")({
	component: FeaturesPage,
	head: seoHead({
		title: "Features · welcome-workspace",
		description:
			"What the dashboard knows and does: the folder, the forge, boards you shape, project pages, reports, IDE, scaffolding.",
		path: "/features",
	}),
});

/** Nav anchors: the five capability themes, in walking order. */
const THEMES = [
	{ id: "folder", title: "Knowing your folder" },
	{ id: "forge", title: "Your forge work" },
	{ id: "boards", title: "The board is your space" },
	{ id: "projects", title: "Project pages" },
	{ id: "beyond", title: "Reports, IDE, new projects" },
] as const;

/** Prose column shared by the two-column themes. */
function Prose({ children }: { children: ReactNode }) {
	return <div className="max-w-prose space-y-4 text-base leading-relaxed text-muted-foreground">{children}</div>;
}

/**
 * The three boards' real captures: the active one large, the other two a
 * click away. The switcher is the app's own picker vocabulary.
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
					Real captures, light &amp; dark schemes in the app&apos;s picker.
				</figcaption>
			</div>
		</figure>
	);
}

const CLONE_EXCERPT = `#!/usr/bin/env bash
# 12 repos · 2026-09-14 · forces SSH.
set -euo pipefail

cloned=0; skipped=0

if [ -d "wpterminate" ]; then
  echo "skip   wpterminate (already exists)"
  skipped=$((skipped + 1))
else
  echo "clone  wpterminate"
  git clone "git@github.com:DimitriGilbert/wpterminate.git"
  cloned=$((cloned + 1))
fi

echo "---"
echo "done: $cloned cloned, $skipped skipped"`;

function FeaturesPage() {
	return (
		<PageShell title="What it does">
			<nav aria-label="Sections" className="mb-12 flex flex-wrap gap-2">
				{THEMES.map((theme) => (
					<a
						key={theme.id}
						href={`#${theme.id}`}
						className="border border-foreground/10 px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
					>
						{theme.title}
					</a>
				))}
			</nav>

			<div className="space-y-16">
				{/* ------------------------------------------------ the folder */}
				<section id="folder" className="scroll-mt-24">
					<SectionHeader title="Knowing your folder" />
					<div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
						<Prose>
							<p>
								A root is a folder you register; its immediate subdirectories become the
								projects. The scan builds each project&apos;s record: filesystem dates, a
								stack guess from the manifest files, and for git repos the branch,
								ahead/behind, dirty count, last commit, and remote, with deep links for
								GitHub, GitLab, Bitbucket, Codeberg, and sourcehut.
							</p>
							<p>
								Health falls out of that state: seven alerts ({" "}
								<span className="font-mono text-xs text-foreground">ERR</span> diverged;{" "}
								<span className="font-mono text-xs text-foreground">WRN</span> no-remote
								and stale-wip; <span className="font-mono text-xs text-foreground">INF</span>{" "}
								behind, unpushed, dirty, dormant) rolling into an attention surface that
								folds away when empty. Recency rides under them: an LED per project cooling
								over roughly 90 days. Press <code className="text-foreground">/</code> to
								filter across name, path, stack, branch, remote, or your own note.
							</p>
							<p>
								Warm rescans skip what didn&apos;t move: the per-project fingerprint
								decides who gets re-read. Overrides (pin, note, hide, last-opened) re-merge
								on every read without a rescan, and they live in the app&apos;s database,
								never in your repos.
							</p>
						</Prose>
						<TriagePreview />
					</div>
				</section>

				{/* ------------------------------------------------ the forge */}
				<section id="forge" className="scroll-mt-24">
					<SectionHeader title="Your forge work" />
					<div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
						<div className="min-w-0">
							<FeedPreview />
							<p className="mt-3 max-w-prose text-[0.8rem] leading-relaxed">
								The chips beside a project&apos;s git state, cached counts labeled with
								where they came from:
							</p>
							<div className="mt-2 border-y border-foreground/10 py-4">
								<ForgeChipsRow />
							</div>
						</div>
						<Prose>
							<p>
								A project&apos;s remote names its forge, host plus{" "}
								<code className="text-foreground">owner/repo</code> from the URL. GitHub is
								the one wired today, through the <code className="text-foreground">gh</code>{" "}
								CLI you already have; the adapter contract is shaped for Gitea and GitLab
								to slot in, and an unsupported host says &ldquo;GitHub only for now&rdquo;
								instead of rendering a broken panel.
							</p>
							<p>
								Sync is a button, and the server enforces guards on it: a five-minute
								minimum interval per repo, in-flight dedupe, one process-wide fetch queue,
								and an <code className="text-foreground">gh auth status</code> probe that
								refuses honestly when the CLI isn&apos;t logged in. A successful sync
								writes a snapshot (open issues and PRs, no history, the next sync
								replaces it) and every read afterwards is a database read.
							</p>
							<p>
								Unsynced shows <span className="text-foreground">Never synced</span>, a
								failed re-sync keeps the last good snapshot and surfaces the error, and
								data older than an hour is stamped{" "}
								<span className="font-mono text-foreground">stale</span>. The feed is the
								account-level view: your open items across every GitHub repository,
								workspace or not.
							</p>
						</Prose>
					</div>
				</section>

				{/* ----------------------------------------------- the boards */}
				<section id="boards" className="scroll-mt-24">
					<SectionHeader title="The board is your space" />
					<div className="mt-4 max-w-prose space-y-4 text-base leading-relaxed text-muted-foreground">
						<p>
							The dashboard is a grid you shape. Every panel drags, resizes, and sheds; the
							arrangement persists. You can strip it to one panel or let it sprawl.
						</p>
						<p>
							Three presets ship: <span className="text-foreground">bento</span> is a mosaic
							with the workspace pulse, <span className="text-foreground">meadow</span> lays
							digests on a daylight ground, <span className="text-foreground">mission-control</span>{" "}
							is a fleet ledger with a triage panel. Each carries a light and a dark scheme,
							and the masthead picker remembers your choice; the picker above re-skins this
							site with the app&apos;s own tokens.
						</p>
						<p>New panels land release over release and the shaping controls keep deepening.</p>
					</div>
					<ThemeShots />
				</section>

				{/* ------------------------------------------- project pages */}
				<section id="projects" className="scroll-mt-24">
					<SectionHeader title="Project pages" />
					<div className="mt-4 max-w-prose space-y-4 text-base leading-relaxed text-muted-foreground">
						<p>
							Open a project and the board gives way to the workbench: a note field for
							where you left off, git fetch / pull ff-only / push, a branch switcher that
							probes before it clobbers, read-only commit history, remote deep links, and
							quick-open for your editor, terminal, or folder. The terminal auto-detects
							common Linux terminals if you leave it unconfigured.
						</p>
						<p>
							Three tabs cover the rest.{" "}
							<span className="font-mono uppercase tracking-[0.08em] text-foreground">files</span>
							: a lazy browser confined to the project subtree (the server rejects{" "}
							<code className="text-foreground">../</code> escapes), with upload (10 MB a
							file), rename, download, and delete-to-trash via{" "}
							<code className="text-foreground">gio</code> when it&apos;s there.{" "}
							<span className="font-mono uppercase tracking-[0.08em] text-foreground">artifacts</span>
							: build and test screenshots and videos, from folders you configure on that
							tab, streamed with range support so video seeking works.{" "}
							<span className="font-mono uppercase tracking-[0.08em] text-foreground">ideation</span>
							: an AI interview that grills an idea one question at a time, then writes a
							PRD and an implementation plan into the project&apos;s{" "}
							<code className="text-foreground">docs/</code>, the session persisted under{" "}
							<code className="text-foreground">.ideadump/</code> so it travels with the
							repo.
						</p>
					</div>
					<figure className="mt-8 overflow-hidden rounded-none ring-1 ring-foreground/10">
						<img
							src="/shot-project.png"
							alt="A project page: git actions band, health and activity panels, commit log, and the files / artifacts / ideation tabs"
							className="block h-auto w-full bg-card"
							width={1440}
							height={728}
						/>
					</figure>
					<div className="mt-4">
						<ProjectTabsPreview />
					</div>
				</section>

				{/* ------------------------------------------------- beyond */}
				<section id="beyond" className="scroll-mt-24">
					<SectionHeader title="Reports, IDE, new projects" />
					<div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
						<Prose>
							<p>
								<span className="text-foreground">Reports.</span> git-snitch is a separate
								CLI the app spawns for you: a report for one repo from the project page, or
								a comparative scan across a whole root from Settings. The output is a
								self-contained HTML file cached under XDG and served at{" "}
								<code className="text-foreground">/reports/&lt;key&gt;</code>, open in a
								new tab from any machine that can reach the app. The boards embed its
								digests (activity, health, code mix, AI usage) and the command resolves
								Settings path, then a local build, then{" "}
								<code className="text-foreground">npx</code>.
							</p>
							<p>
								<span className="text-foreground">Browser IDE.</span> Open IDE starts one
								shared code-server instance, deep-linked per project with{" "}
								<code className="text-foreground">?folder=</code>, one server for many
								projects. First use installs it (~100–200 MB, once) into the app data dir;
								stop it from Settings. It runs{" "}
								<code className="text-foreground">--auth none</code>: fine on localhost or
								a trusted LAN, not something to hang on the public internet.
							</p>
							<p>
								<span className="text-foreground">New projects.</span> Create project
								scaffolds a better-t-stack app into a chosen root with compatibility-aware
								stack lists, live progress, optional install, and an{" "}
								<code className="text-foreground">AGENTS.md</code> when the project
								doesn&apos;t have one. Clone script goes the other way: a portable bash
								script from your selected remotes, SSH forced, existing dirs skipped,
								dupes deduped. You run it on the next machine; the app never clones for
								you.
							</p>
						</Prose>
						<div className="min-w-0 space-y-5">
							<PulsePreview />
							<Terminal label="clone script excerpt" trailing="bash">
								{CLONE_EXCERPT}
							</Terminal>
						</div>
					</div>
				</section>
			</div>

			<div className="mt-14 flex flex-wrap gap-2 border-t border-foreground/10 pt-8">
				<Button render={<Link to="/docs/getting-started" />}>Get it running</Button>
				<Button variant="outline" render={<Link to="/docs/concepts" />}>
					How it works
				</Button>
			</div>
		</PageShell>
	);
}
