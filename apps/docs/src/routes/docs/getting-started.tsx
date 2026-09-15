import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "@workspace-welcome/ui/components/button";

import { PageShell } from "../../components/page-shell";
import { CommandBlock } from "../../components/terminal";
import { seoHead } from "../../seo";

const installerUrl = "https://welcome-workspace.dbuild.dev/install.sh";
const installCommand = `curl -fsSL ${installerUrl} | sh`;

export const Route = createFileRoute("/docs/getting-started")({
  component: GettingStartedPage,
  head: seoHead({
    title: "Install · welcome-workspace",
    description:
      "Install welcome-workspace, add a root, read the scan, sync your GitHub items, and keep your state safe: the whole path from nothing to a running board.",
    path: "/docs/getting-started",
  }),
});

/**
 * One numbered step of the tutorial. The number is part of the heading:
 * this is a flow you follow top to bottom, not a reference to grep.
 */
function Step({
  n,
  title,
  id,
  children,
}: {
  n: string;
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-foreground/10 pt-10 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-4">
        <span
          aria-hidden="true"
          className="shrink-0 font-mono text-sm tabular-nums text-eyebrow"
        >
          {n}
        </span>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Body({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-prose space-y-4 text-base leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

function Capture({
  src,
  alt,
  caption,
  width = 1440,
  height = 728,
  className,
}: {
  src: string;
  alt: string;
  caption: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <figure className={className ?? "mt-6"}>
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

function GettingStartedPage() {
  return (
    <PageShell title="Getting started">
      <div className="space-y-10">
        <Step n="00" title="What you need">
          <Body>
            <p>
              Node 22+, <code className="text-foreground">git</code> on PATH, and either{" "}
              <code className="text-foreground">curl</code> or <code className="text-foreground">wget</code>, plus{" "}
              <code className="text-foreground">tar</code>. That is the whole hard list.
            </p>
            <p>
              On Linux with a systemd user session the installer also registers a service that
              keeps the app running. On macOS that step is skipped automatically, you start the
              app yourself (step 2). Optional niceties:{" "}
              <code className="text-foreground">gio</code> so file-browser deletes go to the trash
              instead of being permanent, and a GitHub CLI (<code className="text-foreground">gh</code>)
              login if you want your issues and pull requests on the dashboard (step 6).
            </p>
          </Body>
        </Step>

        <Step n="01" title="Install">
          <Body>
            <p>One line:</p>
          </Body>
          <CommandBlock command={installCommand} />
          <Body>
            <p>What the script actually does, in order:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Checks Node 22+, curl or wget, and tar</li>
              <li>Resolves the latest GitHub release (or the one you pinned with <code className="text-foreground">--version</code>)</li>
              <li>Verifies the download against the release&apos;s <code className="text-foreground">SHA256SUMS.txt</code>; a mismatch aborts before anything is installed</li>
              <li>Installs to <code className="text-foreground">~/.local/share/workspace-welcome/app</code></li>
              <li>Writes a <code className="text-foreground">.env</code> (PORT, HOST) next to the app</li>
              <li>Installs and starts the systemd user service (Linux; skip with <code className="text-foreground">--no-service</code>)</li>
            </ul>
            <p>
              Your config is never touched, not on install, not on upgrade. Piping curl to sh is
              a trust decision;{" "}
              <a
                href="https://github.com/DimitriGilbert/workspace-welcome/blob/main/scripts/install.sh"
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline underline-offset-4"
              >
                read the script
              </a>{" "}
              first if you haven&apos;t. To watch every step without changing anything:
            </p>
          </Body>
          <CommandBlock command={`curl -fsSL ${installerUrl} | sh -s -- --dry-run`} />
          <Body>
            <p>
              Don&apos;t want the pipe at all? Every release ships one tarball per platform plus a{" "}
              <code className="text-foreground">SHA256SUMS.txt</code>;{" "}
              <Link
                to="/docs/getting-started"
                hash="manual"
                className="text-foreground underline underline-offset-4"
              >
                step 9
              </Link>{" "}
              walks the manual path.
            </p>
          </Body>
        </Step>

        <Step n="02" title="First launch">
          <Body>
            <p>
              Open <code className="text-foreground">http://localhost:37420</code>. On Linux the
              service is already running (macOS:{" "}
              <code className="text-foreground">node serve-prod.mjs</code> inside the app
              directory).
            </p>
            <p>
              You land on an empty board. The masthead is the control strip: the{" "}
              <span className="font-mono uppercase tracking-[0.08em]">board</span> and{" "}
              <span className="font-mono uppercase tracking-[0.08em]">scheme</span> pickers (three
              boards, each with a light and a dark scheme), then Add directory, Create project,
              Generate report, Clone script, Rescan, and Settings. The filter field takes{" "}
              <code className="text-foreground">/</code> from anywhere on the page.
            </p>
            <p>
              The board is a grid you shape: every panel drags, resizes, and sheds, and the
              arrangement persists. mission-control (the default) is a fleet ledger with a triage
              panel, bento is a mosaic with the workspace pulse, meadow lays digests on a daylight
              ground. New panels land over releases.
            </p>
          </Body>
          <Capture
            src="/dashboard.png"
            alt="The mission-control board: triage panel, fleet ledger, activity and AI usage charts"
            caption="mission-control, the default board: triage left, the fleet ledger under it, charts right"
          />
        </Step>

        <Step n="03" title="Add a root">
          <Body>
            <p>
              Click <span className="text-foreground">Add directory</span> and pick a folder:{" "}
              <code className="text-foreground">~/workspace</code>,{" "}
              <code className="text-foreground">~/src</code>, wherever your repos are. That folder
              becomes a <span className="text-foreground">root</span>; its{" "}
              <em>immediate subdirectories</em> are your projects. Not recursive: a project is a
              directory you would <code className="text-foreground">cd</code> into. Roots are
              managed under Settings too.
            </p>
            <p>
              The first scan runs immediately and fills the board. Each project gets its
              filesystem dates (created / last touched), a stack guess (Node, Python, Rust, …),
              its git state (branch, ahead/behind, dirty files, last commit, remote), and any
              health alerts the state implies. Click through to a project and{" "}
              <span className="text-foreground">pin</span> it, hide it, or leave a{" "}
              <span className="text-foreground">note</span>; those overrides live in the database,
              never in your repos.
            </p>
            <p>
              Rescans are cheap: a per-project fingerprint means only what actually moved gets
              re-read, and a new project directory appears on the next scan by itself.
            </p>
          </Body>
        </Step>

        <Step n="04" id="alerts" title="The seven alerts">
          <Body>
            <p>
              The scanner emits seven alerts, and the boards roll the loud ones into a triage /
              needs-attention panel so the worst ones surface first:
            </p>
            <div className="overflow-x-auto rounded-none ring-1 ring-foreground/10">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-foreground/10 bg-card/40 text-foreground">
                  <tr>
                    <th className="px-4 py-3 font-mono text-[0.7rem] font-medium uppercase tracking-[0.08em]">Severity</th>
                    <th className="px-4 py-3 font-mono text-[0.7rem] font-medium uppercase tracking-[0.08em]">Alert</th>
                    <th className="px-4 py-3 font-mono text-[0.7rem] font-medium uppercase tracking-[0.08em]">Means</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b border-foreground/10">
                    <td className="px-4 py-2.5 font-mono text-xs">ERR</td>
                    <td className="px-4 py-2.5">diverged</td>
                    <td className="px-4 py-2.5">Ahead of and behind the upstream at once; a push will not go through cleanly</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="px-4 py-2.5 font-mono text-xs" rowSpan={2}>WRN</td>
                    <td className="px-4 py-2.5">no-remote</td>
                    <td className="px-4 py-2.5">No remote configured: work that exists only here</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="px-4 py-2.5">stale-wip</td>
                    <td className="px-4 py-2.5">Uncommitted changes sitting for 3+ weeks</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="px-4 py-2.5 font-mono text-xs" rowSpan={4}>INF</td>
                    <td className="px-4 py-2.5">behind</td>
                    <td className="px-4 py-2.5">Commits behind upstream: pull before you branch</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="px-4 py-2.5">unpushed</td>
                    <td className="px-4 py-2.5">Local commits no remote has seen</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="px-4 py-2.5">dirty</td>
                    <td className="px-4 py-2.5">Uncommitted files in the tree</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">dormant</td>
                    <td className="px-4 py-2.5">No activity in 90+ days: archive candidate</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Everything on the board also carries a recency heat: the little LED beside each
              project goes from fresh to stale over roughly 90 days: so the dust settles visually
              even where no alert fires.
            </p>
          </Body>
        </Step>

        <Step n="05" title="Open a project">
          <Body>
            <p>
              Click any project. The top band is the git cockpit: branch switcher (with a safety
              probe when switching would clobber something), fetch / pull / push, the sync status
              (<code className="text-foreground">↑ ahead ↓ behind / dirty</code>), the remote
              deep-link, and quick-open buttons for editor, terminal, folder, and the browser IDE.
            </p>
            <p>
              Below that, the work surface: health signals, activity and code-mix charts, the
              commit history, the{" "}
              <span className="text-foreground">Where I left off</span> note, a{" "}
              <span className="text-foreground">Report</span> button (a self-contained git-snitch
              HTML file), and three tabs: <span className="font-mono uppercase tracking-[0.08em]">files</span>{" "}
              (a browser confined to the project subtree),{" "}
              <span className="font-mono uppercase tracking-[0.08em]">artifacts</span> (your
              build/test screenshots and videos, from folders you configure on that tab), and{" "}
              <span className="font-mono uppercase tracking-[0.08em]">ideation</span> (an AI
              interview that grills an idea one question at a time, then writes a PRD and an
              implementation plan into the project&apos;s <code className="text-foreground">docs/</code>).
            </p>
          </Body>
          <Capture
            src="/shot-project.png"
            alt="A project page: git actions band, health and activity widgets, commit log, and the files/artifacts/ideation tabs"
            caption="a project page: git cockpit on top, widgets below, tabs at the bottom"
          />
        </Step>

        <Step n="06" title="Sync your GitHub issues and pull requests">
          <Body>
            <p>
              If a project&apos;s remote is on GitHub, its open issues and PRs can sit beside
              everything else. The fetch runs through your own{" "}
              <code className="text-foreground">gh</code> CLI, so first:
            </p>
          </Body>
          <CommandBlock command={"gh auth status   # must succeed: the app probes this and refuses honestly if it fails"} />
          <Body>
            <p>
              Then press a Sync button. There are three doors, all explicit: the project page&apos;s{" "}
              <span className="font-mono uppercase tracking-[0.08em]">issues &amp; pull requests</span>{" "}
              board, the dashboard&apos;s{" "}
              <span className="font-mono uppercase tracking-[0.08em]">my issues &amp; pull requests</span>{" "}
              feed, and Settings → Forge, where per-repo Sync buttons sit next to a{" "}
              <span className="text-foreground">Sync all</span> that sweeps every mapped repo and
              your feed, one fetch at a time.
            </p>
            <p>
              Nothing syncs on its own: no polling, no fetch on page load. The guards are the
              point: a five-minute server-side minimum interval per repo, in-flight dedupe, a
              single sequential fetch queue, and an availability probe of{" "}
              <code className="text-foreground">gh auth status</code> cached for ten minutes. Your
              rate-limited account is the design constraint, not an afterthought.
            </p>
            <p>
              Reading the counts: a project&apos;s chips and board show{" "}
              <span className="text-foreground">repo totals</span>, every open item in that
              repository as of the last sync. The dashboard feed shows{" "}
              <span className="text-foreground">your items</span>, the signed-in account&apos;s
              open issues and PRs across every GitHub repo, workspace or not. A project board with
              no repo snapshot falls back to your feed items for its slug and says so
              (&ldquo;your open items · from your feed&rdquo;); syncing upgrades it to full totals.
            </p>
            <p>
              Honesty rules: a capped list reads{" "}
              <span className="font-mono uppercase tracking-[0.08em]">50+</span>, a failed first
              sync shows <span className="text-foreground">Never synced</span> with the Sync
              button, a failed re-sync keeps the last good snapshot and surfaces the error, and
              data older than an hour is stamped{" "}
              <span className="font-mono uppercase tracking-[0.08em]">stale</span>, a hint
              rather than a fetch trigger.
            </p>
          </Body>
          <div className="mt-6 grid max-w-4xl gap-6 lg:grid-cols-2">
            <Capture
              src="/shot-forge.png"
              alt="The issues & pull requests board on a project page: repo slug, synced-at time with a stale marker, Sync button, and the cached issue/PR rows"
              caption="a project's forge board: cached rows, synced-at time, stale stamp, sync one click away"
              width={924}
              height={856}
              className=""
            />
            <Capture
              src="/shot-feed.png"
              alt="The my issues & pull requests feed on the dashboard: 50+ issues and 31 PRs, synced-at time, rows with owner/repo attribution"
              caption="the cross-repo feed: your open items everywhere, owner/repo on every row"
              width={976}
              height={896}
              className=""
            />
          </div>
        </Step>

        <Step n="07" title="Where your state lives">
          <Body>
            <p>
              One sqlite database holds everything the app remembers: roots, pins, notes, hides,
              open commands, artifact folders, settings, the forge snapshots, and your feed. It
              lives at <code className="text-foreground">$XDG_DATA_HOME/workspace-welcome/workspace-welcome.db</code>{" "}
              (on most boxes <code className="text-foreground">~/.local/share/workspace-welcome/workspace-welcome.db</code>),
              in WAL mode, embedded: there is no database server.
            </p>
            <p>
              Coming from an older version? The legacy JSON config ({" "}
              <code className="text-foreground">store.json</code> and the per-project files) is
              imported once on first boot, in one transaction, and then never written again; the
              originals stay on disk as untouched backups.
            </p>
            <p>
              To back up: stop the service, copy the <code className="text-foreground">.db</code>{" "}
              file (plus its <code className="text-foreground">-wal</code> sidecar if present),
              start it again. Restore is copying it back. Reports are disposable cache under{" "}
              <code className="text-foreground">~/.cache/workspace-welcome/reports/</code>; the
              code-server install lives beside the database under{" "}
              <code className="text-foreground">ide/</code>. Ideation sessions are the one state
              that travels differently: they live inside each project under{" "}
              <code className="text-foreground">.ideadump/</code>, so they move with the repo.
            </p>
          </Body>
        </Step>

        <Step n="08" title="The settings tour">
          <Body>
            <p>
              Settings is one page, seven sections, no hidden registry. What each one actually
              controls:
            </p>
            <dl className="space-y-4">
              {[
                [
                  "Workspace",
                  "Your roots: add or remove directories, run a per-root comparative scan report, and restore hidden projects (the section only appears when something is hidden). Removing a root drops the overrides pinned under it.",
                ],
                [
                  "Web IDE",
                  "Status and stop for the one shared code-server instance. It is started on demand from a project's Open IDE button: first use downloads code-server (~100–200 MB, once) into the app data dir.",
                ],
                [
                  "Open commands",
                  "The editor and terminal the quick-open buttons use. The project path is passed as the last argument; the terminal is launched with --working-directory. Leave the terminal blank and the app picks the first of the common Linux terminals it finds.",
                ],
                [
                  "git-snitch CLI path",
                  "Where the report generator lives. Blank means auto: a local gitsnitch build if you have one, otherwise npx. Set it when you want a specific binary: the app then runs node <path>.",
                ],
                [
                  "Exclude globs",
                  "Directory names the scan skips when computing a project's activity date: node_modules-style entries, gitignore-style globs. Use it so a fat build folder doesn't make a dead repo look alive.",
                ],
                [
                  "Ideation models",
                  "The models the ideation interview uses per step. Changes are frozen into new sessions when they start: a running interview keeps the models it began with.",
                ],
                [
                  "Forge",
                  "The register of every mapped project↔repo link with its cached open counts and last-sync time; per-repo Sync buttons and Sync all. This is the only place that talks to GitHub, and only when you press it.",
                ],
              ].map(([term, body]) => (
                <div key={term} className="border-l-2 border-(--pinned-accent) pl-4">
                  <dt className="text-sm font-medium tracking-tight text-foreground">{term}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</dd>
                </div>
              ))}
            </dl>
          </Body>
          <Capture
            src="/shot-settings.png"
            alt="The settings page: workspace roots, web IDE status, open commands, git-snitch path, exclude globs, ideation models, and the forge register"
            caption="settings: every knob on one page; the forge register at the bottom is the sync cockpit"
            height={900}
          />
          <Body>
            <p>
              Paths and the trust boundary (what talks to the network, what never does) are
              catalogued on{" "}
              <Link to="/docs/settings" className="text-foreground underline underline-offset-4">
                Settings &amp; data
              </Link>
              .
            </p>
          </Body>
        </Step>

        <Step n="09" id="manual" title="Manual install, upgrading, uninstall">
          <Body>
            <p>
              <span className="text-foreground">Manual install</span>, for when you will not pipe
              curl to sh. Every release ships one tarball per platform ({" "}
              <code className="text-foreground">linux</code>/<code className="text-foreground">darwin</code>,{" "}
              <code className="text-foreground">x64</code>/<code className="text-foreground">arm64</code>,{" "}
              <code className="text-foreground">-musl</code> for Alpine) plus{" "}
              <code className="text-foreground">SHA256SUMS.txt</code>; the{" "}
              <code className="text-foreground">releases/latest/download/</code> URLs redirect to
              whatever is newest.
            </p>
          </Body>
          <CommandBlock
            command={`version=0.1.0
base="https://github.com/DimitriGilbert/workspace-welcome/releases/download/v\${version}"
curl -fLO "\${base}/workspace-welcome-\${version}-linux-x64.tar.gz"
curl -fLO "\${base}/SHA256SUMS.txt"
grep "workspace-welcome-\${version}-linux-x64.tar.gz" SHA256SUMS.txt | sha256sum -c -
tar -xzf "workspace-welcome-\${version}-linux-x64.tar.gz"
cd workspace-welcome
node serve-prod.mjs`}
          />
          <Body>
            <p>
              <code className="text-foreground">sha256sum -c</code> should print OK (macOS:{" "}
              <code className="text-foreground">shasum -a 256 -c -</code>). The server reads{" "}
              <code className="text-foreground">PORT</code> and{" "}
              <code className="text-foreground">HOST</code> from the environment or a{" "}
              <code className="text-foreground">.env</code> next to{" "}
              <code className="text-foreground">serve-prod.mjs</code>: defaults 37420 and{" "}
              <code className="text-foreground">127.0.0.1</code>. This is exactly what the
              installer automates.
            </p>
            <p>
              <span className="text-foreground">Upgrading</span>: re-run the installer; that is
              the whole path. Your <code className="text-foreground">.env</code> and your data
              survive, and the previous version is kept at{" "}
              <code className="text-foreground">app.bak</code> for rollback; delete it once
              you&apos;re happy. Pin a version with{" "}
              <code className="text-foreground">--version vX.Y.Z</code>.
            </p>
            <p>
              <span className="text-foreground">Uninstall</span>:{" "}
              <code className="text-foreground">--uninstall</code> stops and removes the service
              and the app but keeps your config, cache, and data.{" "}
              <code className="text-foreground">--purge --yes</code> removes all of it.
            </p>
          </Body>
          <CommandBlock
            command={`curl -fsSL ${installerUrl} | sh -s -- --uninstall
curl -fsSL ${installerUrl} | sh -s -- --purge --yes`}
          />
        </Step>

        <Step n="10" title="Running it day to day">
          <Body>
            <p>Service controls and logs (Linux installs):</p>
          </Body>
          <CommandBlock
            command={`systemctl --user status workspace-welcome
journalctl --user -u workspace-welcome -f`}
          />
          <Body>
            <p>
              Change the port after install by overriding the unit&apos;s environment:{" "}
              <code className="text-foreground">systemctl --user edit workspace-welcome</code>, add{" "}
              <code className="text-foreground">Environment=PORT=5050</code> under{" "}
              <code className="text-foreground">[Service]</code>, then{" "}
              <code className="text-foreground">daemon-reload</code> and restart. On a headless
              box, enable linger or the service dies at logout:{" "}
              <code className="text-foreground">sudo loginctl enable-linger $USER</code>.
            </p>
            <p>
              Port busy at install time? <code className="text-foreground">--port N</code> picks
              another. A SHA256 mismatch aborts before anything is installed; the download was
              corrupted, re-run the installer. Everything else lives in the journal.
            </p>
          </Body>
        </Step>
      </div>

      <div className="mt-14 flex flex-wrap gap-2 border-t border-foreground/10 pt-8">
        <Button render={<Link to="/docs/concepts" />}>How it works</Button>
        <Button variant="outline" render={<Link to="/docs/settings" />}>
          Settings &amp; data
        </Button>
      </div>
    </PageShell>
  );
}
