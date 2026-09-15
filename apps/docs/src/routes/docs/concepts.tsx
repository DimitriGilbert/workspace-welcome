import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PageShell } from "../../components/page-shell";
import { TriagePreview, PulsePreview } from "../../components/previews";
import { Terminal } from "../../components/terminal";
import { seoHead } from "../../seo";
import { THEME_SHOT } from "../../theme";

export const Route = createFileRoute("/docs/concepts")({
  component: ConceptsPage,
  head: seoHead({
    title: "How it works · welcome-workspace",
    description:
      "The machinery: roots and the scan, health alerts, the board, the forge layer and its sync guards, reports, the project surface, and the sqlite state behind it all.",
    path: "/docs/concepts",
  }),
});

/**
 * One numbered part. Children are content-shaped: prose runs at reading
 * width, captures and terminals run wider.
 */
function Part({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="scroll-mt-24 border-t border-foreground/10 pt-10 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-4">
        <span aria-hidden="true" className="shrink-0 font-mono text-sm tabular-nums text-eyebrow">
          {n}
        </span>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** Reading-width prose inside a part. */
function P({ children }: { children: ReactNode }) {
  return <p className="max-w-prose text-base leading-relaxed text-muted-foreground">{children}</p>;
}

function Term({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

/** A wide capture inside a part. */
function Capture({
  src,
  alt,
  caption,
  width,
  height,
}: {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}) {
  return (
    <figure className="max-w-3xl">
      <div className="overflow-hidden rounded-none ring-1 ring-foreground/10">
        <img
          src={src}
          alt={alt}
          className="block h-auto w-full bg-card"
          width={width}
          height={height}
          loading="lazy"
        />
      </div>
      <figcaption className="mt-2 text-[0.7rem] text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

/** The commands one scan pass runs per repo, verbatim from the scanner. */
const GIT_COMMANDS = `git rev-parse --is-inside-work-tree
git symbolic-ref --short HEAD
git config --get remote.origin.url
git rev-list --left-right --count @{u}...HEAD
git --no-optional-locks status --porcelain
git log -1 --format=%H%x09%s%x09%an%x09%aI`;

const REFERENCE: Array<[string, string]> = [
  ["Root", "A configured directory whose immediate subdirectories become projects. Edited in Settings, stored in sqlite."],
  ["Project", "One scanned subdirectory of a root: dates, stack, git state, alerts, plus your overrides (pin / note / hide / last-opened)."],
  ["Scan", "The cached pass over all roots. Fingerprints decide which projects get re-read; overrides re-merge on every call without a rescan."],
  ["Board", "One dashboard preset (bento, meadow, or mission-control): a movable widget grid with a light and a dark scheme each."],
  ["Forge", "A code-hosting backend. GitHub today, through your gh CLI; the adapter contract leaves room for Gitea and GitLab."],
  ["Forge sync", "The explicit, user-triggered fetch behind every Sync button. Min-interval, dedupe, one sequential queue; nothing auto-syncs."],
  ["Forge snapshot", "A repo's open issues/PRs as of the last sync, cached in sqlite. Reads are DB-only; a capped list renders 50+."],
  ["Feed", "The dashboard's cross-repo board: your open GitHub items across every repository, workspace or not."],
  ["Report", "A self-contained git-snitch HTML file for one repo or a whole root. Served at /reports/<key>, cached under XDG."],
  ["File browser", "Per-project lazy listing with upload / rename / delete / new folder / download. Confined to the project subtree."],
  ["Artifact folders", "Per-project folders where build/test screenshots and videos land; the Artifacts tab configures and streams them."],
  ["Ideation", "The per-project AI interview: grilling, PRD, plan, sessions persisted in the project under .ideadump/."],
  ["IDE server", "One shared code-server child process, spawned on demand, deep-linked per project with ?folder=."],
];

function ConceptsPage() {
  return (
    <PageShell title="How it works">
      <div className="space-y-12">
        <Part n="01" title="The folder, read">
          <P>
            The app watches <Term>roots</Term>, directories you register. A root is not scanned
            recursively: its immediate subdirectories are the projects, because a project is
            something you would <code className="text-foreground">cd</code> into. No nesting
            surprises, no <code className="text-foreground">node_modules</code> scavenging.
          </P>
          <P>
            A <Term>scan</Term> builds a <Term>project</Term> record for each child: filesystem
            dates, a stack guess, and for a git repo the output of six commands run with{" "}
            <code className="text-foreground">execFile</code> in the project directory:
          </P>
          <Terminal label="the scan, per repo" trailing="read-only">
            {GIT_COMMANDS}
          </Terminal>
          <P>
            Those six answers become the branch, ahead/behind counts, remote, dirty-file count,
            and last commit. Overrides you set by hand (pin, note, hide, last-opened) merge on
            top; the scanner never writes into your repos.
          </P>
          <P>
            Each project carries a fingerprint (directory mtime,{" "}
            <code className="text-foreground">.git/HEAD</code>,{" "}
            <code className="text-foreground">.git/index</code>, and a hash of{" "}
            <code className="text-foreground">git status --porcelain</code>), so a warm rescan
            re-reads only the projects whose fingerprint moved. Adding a directory or changing
            exclude globs invalidates the whole cache, because what exists changed.
          </P>
        </Part>

        <Part n="02" title="What the state says">
          <P>
            Seven health alerts fall out of the git state, each with a severity:{" "}
            <span className="font-mono text-xs">ERR</span> diverged,{" "}
            <span className="font-mono text-xs">WRN</span> no-remote and stale-wip,{" "}
            <span className="font-mono text-xs">INF</span> behind, unpushed, dirty, dormant. The
            wording is the scanner&apos;s own (&ldquo;Uncommitted changes sitting for 3+
            weeks&rdquo;, &ldquo;No activity in 90+ days&rdquo;) and the boards surface the loud
            ones in a triage panel. The{" "}
            <Link to="/docs/getting-started" hash="alerts" className="text-foreground underline underline-offset-4">
              install guide
            </Link>{" "}
            tabulates all seven with their meanings.
          </P>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
            <P>
              Under the alerts sits recency: an LED per project that cools from fresh to stale
              over roughly 90 days, and the boards sort by last touch.
            </P>
            <TriagePreview />
          </div>
        </Part>

        <Part n="03" title="The board">
          <P>
            The dashboard is a <Term>board</Term>: a widget grid where every panel can be dragged,
            resized, or shed, by pointer or by keyboard (arrow keys, with live announcements).
            The arrangement persists.
          </P>
          <P>
            Three presets ship: <span className="text-foreground">bento</span> is a mosaic with a
            workspace pulse, <span className="text-foreground">meadow</span> lays workspace
            digests on a daylight ground, <span className="text-foreground">mission-control</span>{" "}
            is a fleet ledger with a triage panel. Each carries a light and a dark scheme, and
            the masthead picker remembers your choice.
          </P>
          <P>New panels land over releases and the shaping controls keep deepening.</P>
          <figure className="max-w-3xl">
            <div className="grid gap-3 sm:grid-cols-3">
              {(["mission-control", "bento", "meadow"] as const).map((id) => (
                <div key={id} className="min-w-0 border border-foreground/10 p-1.5">
                  <img
                    src={THEME_SHOT[id].src}
                    alt={THEME_SHOT[id].alt}
                    className="block h-24 w-full bg-card object-cover object-top"
                    loading="lazy"
                  />
                  <span className="mt-2 block px-0.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
                    {id}
                  </span>
                </div>
              ))}
            </div>
            <figcaption className="mt-2 text-[0.7rem] text-muted-foreground">
              The same folder on the three presets; the picker in this site&apos;s masthead is
              the app&apos;s own.
            </figcaption>
          </figure>
        </Part>

        <Part n="04" title="The forge layer">
          <P>
            A project&apos;s git remote names its <Term>forge</Term>, the code host it lives on.
            The remote URL is parsed into a host and an{" "}
            <code className="text-foreground">owner/repo</code> slug that links the local
            directory to a repository. Today the only forge is GitHub, reached through your own{" "}
            <code className="text-foreground">gh</code> CLI. The adapter contract (CLI or HTTP
            style) is built so Gitea and GitLab can slot in without reshaping anything, and an
            unsupported host renders an honest &ldquo;GitHub only for now&rdquo;, never a broken
            panel.
          </P>
          <P>
            <Term>Forge sync</Term> is the only network call and it is user-triggered: no
            polling, no fetch-on-load. Each call passes server-side guards in order (a
            five-minute minimum interval per repo, in-flight dedupe, a process-wide queue so
            exactly one fetch runs at a time) plus an{" "}
            <code className="text-foreground">gh auth status</code> probe, cached ten minutes,
            that refuses honestly when the CLI isn&apos;t logged in.
          </P>
          <div className="grid gap-6 lg:grid-cols-2">
            <Capture
              src="/shot-forge.png"
              alt="The issues & pull requests board on a project page: repo slug, synced-at time with a stale marker, Sync button, and the cached issue/PR rows"
              caption="a project's forge board: cached rows, synced-at time, sync one click away"
              width={924}
              height={856}
            />
            <Capture
              src="/shot-feed.png"
              alt="The my issues & pull requests feed on the dashboard: 50+ issues and 31 PRs, synced-at time, rows with owner/repo attribution"
              caption="the cross-repo feed: your open items everywhere, owner/repo on every row"
              width={976}
              height={896}
            />
          </div>
          <P>
            A successful sync writes a <Term>forge snapshot</Term>: the repo&apos;s open issues
            and PRs as of that moment, cached in sqlite with no history; the next sync replaces
            it. Every read is a database read, so rendering can never stall on the network or
            spend your rate limit.
          </P>
          <P>
            The honesty rules are strict: a list that hit the 50-per-page cap renders{" "}
            <span className="font-mono uppercase tracking-[0.08em]">50+</span>, never a fabricated
            exact count; a failed first sync leaves the board in a{" "}
            <span className="text-foreground">Never synced</span> state with the Sync button; a
            failed re-sync keeps the last good snapshot and shows the error; anything older than
            an hour is stamped <span className="font-mono uppercase tracking-[0.08em]">stale</span>,
            a hint rather than a fetch trigger.
          </P>
          <P>
            The <Term>feed</Term> is the cross-repo sibling: your open issues and PRs across every
            GitHub repository, workspace or not, with owner/repo attribution on every row. Chips
            beside project names show the cached counts, and a project board with no snapshot of
            its own falls back to your feed items for that slug, labeled as such and upgradeable
            to full totals with a sync.
          </P>
        </Part>

        <Part n="05" title="git-snitch reports">
          <P>
            A <Term>report</Term> is a self-contained HTML file produced by git-snitch, a separate
            CLI the app spawns for you. Two kinds: a project report for one repo, and a root
            report, a comparative scan of every repo under a root. The app resolves the command
            from Settings, falls back to a local build, then to npx; the run streams progress
            from the generator&apos;s stderr while you watch.
          </P>
          <P>
            Finished files cache under{" "}
            <code className="text-foreground">$XDG_CACHE_HOME/workspace-welcome/reports/</code>{" "}
            and are served at <code className="text-foreground">/reports/&lt;key&gt;</code>, so a
            report opens in a new tab from any machine that can reach the app. Regenerating a key
            overwrites it; reports are a cache, not an archive. The boards embed its digests
            (activity, health, code mix, AI usage), so the numbers on the dashboard and the page
            behind them come from the same run:
          </P>
          <PulsePreview className="max-w-3xl" />
        </Part>

        <Part n="06" title="The project surface">
          <P>
            Opening a project swaps the bird&apos;s-eye view for the workbench. The{" "}
            <Term>file browser</Term> lists the project lazily and handles upload (10 MB per
            file), rename, new folder, download, and delete. Deletion goes to the trash via{" "}
            <code className="text-foreground">gio</code> when the machine has it, otherwise it is
            permanent behind the same confirmation. The browser is confined to the project
            subtree: the server rejects path escapes (ADR-0002).
          </P>
          <Capture
            src="/shot-project.png"
            alt="A project page: git actions band, health and activity panels, commit log, and the files / artifacts / ideation tabs"
            caption="a project page: git cockpit on top, widgets below, tabs at the bottom"
            width={1440}
            height={728}
          />
          <P>
            <Term>Artifact folders</Term> are per-project paths where build and test media land:
            screenshots, videos. Configure them on the Artifacts tab and the viewer streams the
            files with HTTP range support, so video seeking works. They are media outputs,
            distinct from ideation&apos;s documents.
          </P>
          <P>
            <Term>Ideation</Term> is the AI interview: it grills an idea one question at a time,
            then generates a PRD and an implementation plan into the project&apos;s{" "}
            <code className="text-foreground">docs/</code>. Steps can fan out over several models
            with a reconciler merging and grading the candidates; every session persists under{" "}
            <code className="text-foreground">.ideadump/</code> in the project, so it travels
            with the repo and survives restarts. Models are picked in Settings and frozen into
            each session when it starts.
          </P>
          <P>
            The <Term>IDE server</Term> is one shared code-server child process, spawned on demand
            the first time you press Open IDE (auto-installed into the app data dir) and stopped
            from Settings. Opening a specific project deep-links the shared instance with{" "}
            <code className="text-foreground">?folder=</code>, one server for many projects (ADRs
            0003/0004).
          </P>
        </Part>

        <Part n="07" title="Where it all lands">
          <P>
            Everything above reads your filesystem; what the app itself remembers sits in one
            embedded sqlite database (WAL, no server) under the XDG data dir, migrated and
            imported per ADR-0006. The full path map, what each settings knob does, and the trust
            boundary (what talks to the network and what never does) are on{" "}
            <Link to="/docs/settings" className="text-foreground underline underline-offset-4">
              Settings &amp; data
            </Link>
            .
          </P>
        </Part>

        <Part n="08" title="Reference">
          <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
            Every term, one line each, in walking order:
          </p>
          <dl className="divide-y divide-foreground/10 border-y border-foreground/10">
            {REFERENCE.map(([term, body]) => (
              <div key={term} className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                <dt className="font-mono text-[0.75rem] uppercase tracking-[0.08em] text-foreground">
                  {term}
                </dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">{body}</dd>
              </div>
            ))}
          </dl>
        </Part>
      </div>

      <div className="mt-14 flex flex-wrap gap-2 border-t border-foreground/10 pt-8">
        <Link
          to="/docs/getting-started"
          className="border border-foreground/10 px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
          ← Getting started
        </Link>
        <Link
          to="/docs/settings"
          className="border border-foreground/10 px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
          Settings &amp; data →
        </Link>
      </div>
    </PageShell>
  );
}
