import { Link, createFileRoute } from "@tanstack/react-router";

import { PageShell } from "../../components/page-shell";
import { seoHead } from "../../seo";

export const Route = createFileRoute("/docs/settings")({
  component: SettingsDocsPage,
  head: seoHead({
    title: "Settings · welcome-workspace",
    description:
      "Every settings knob in welcome-workspace, what it controls, and every path the app writes. Your state stays on the machine that runs the app.",
    path: "/docs/settings",
  }),
});

const SECTIONS: Array<{ name: string; does: string }> = [
  {
    name: "Workspace",
    does: "Your roots: add or remove tracked directories, run a per-root comparative scan report, restore hidden projects (the restore list only appears when something is hidden). Removing a root drops the overrides pinned under it.",
  },
  {
    name: "Web IDE",
    does: "Status and stop for the one shared code-server instance. Started on demand from a project's Open IDE button; first use downloads code-server (~100–200 MB, once).",
  },
  {
    name: "Open commands",
    does: "Which editor and terminal the quick-open buttons launch. The project path is passed as the last argument; the terminal is launched with --working-directory. Leave the terminal blank and the app picks the first of the common Linux terminals it finds (konsole, gnome-terminal, kitty, alacritty, …).",
  },
  {
    name: "git-snitch CLI path",
    does: "Where the report generator lives. Blank means auto: a local gitsnitch build if one exists, otherwise npx. When set, the app runs node <path>.",
  },
  {
    name: "Exclude globs",
    does: "Directory names the scan skips when computing a project's activity date: node_modules-style entries, gitignore-style globs. Use it so a fat build folder can't make a dead repo look alive.",
  },
  {
    name: "Ideation models",
    does: "The models the ideation interview uses per step. Changes are frozen into new sessions when they start; a running interview keeps the models it began with.",
  },
  {
    name: "Forge",
    does: "The register of every mapped project↔repo link: cached open counts, last-sync time, per-repo Sync, and Sync all (which sweeps every project and your feed, sequentially). The only place the app talks to GitHub, and only on a button.",
  },
];

const PATHS: Array<[string, string]> = [
  [
    "Everything persisted: roots, pins, notes, hides, open commands, artifact folders, settings, forge snapshots, your feed",
    "$XDG_DATA_HOME/workspace-welcome/workspace-welcome.db",
  ],
  [
    "Legacy JSON config: imported once on first boot, never written again; stays as an untouched backup",
    "$XDG_CONFIG_HOME/workspace-welcome/store.json + per-project JSON under $XDG_DATA_HOME/workspace-welcome/projects/",
  ],
  ["Report HTML cache: disposable, deterministically re-creatable", "$XDG_CACHE_HOME/workspace-welcome/reports/"],
  ["code-server install for the browser IDE", "$XDG_DATA_HOME/workspace-welcome/ide/"],
  ["The app itself", "~/.local/share/workspace-welcome/app (previous version kept at app.bak for rollback)"],
];

function SettingsDocsPage() {
  return (
    <PageShell title="Settings & data">
      <p className="mb-10 max-w-prose text-base leading-relaxed text-muted-foreground">
        Seven knobs in the UI, five paths on disk. The tour below follows the settings page top
        to bottom; if it isn&apos;t here, the app doesn&apos;t have that knob.
      </p>
      <div className="max-w-3xl space-y-12">
        <section>
          <h2 className="text-[0.8rem] font-medium tracking-tight">
            The seven sections
            <div aria-hidden="true" className="mt-3 h-px flex-1 bg-gradient-to-r from-foreground/15 to-transparent" />
          </h2>
          <dl className="mt-5 divide-y divide-foreground/10 border-y border-foreground/10">
            {SECTIONS.map((section) => (
              <div key={section.name} className="grid gap-1.5 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
                <dt className="font-mono text-[0.75rem] uppercase tracking-[0.08em] text-foreground">
                  {section.name}
                </dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">{section.does}</dd>
              </div>
            ))}
          </dl>
          <figure className="mt-8">
            <div className="overflow-hidden rounded-none ring-1 ring-foreground/10">
              <img
                src="/shot-settings.png"
                alt="The settings page: workspace roots, web IDE, open commands, git-snitch path, exclude globs, ideation models, forge register"
                className="block h-auto w-full bg-card"
                width={1440}
                height={900}
                loading="lazy"
              />
            </div>
            <figcaption className="mt-2 text-[0.7rem] text-muted-foreground">
              The settings page, top to bottom; the forge register with its per-repo Sync buttons
              sits at the bottom.
            </figcaption>
          </figure>
        </section>

        <section>
          <h2 className="text-[0.8rem] font-medium tracking-tight">
            On disk
            <div aria-hidden="true" className="mt-3 h-px flex-1 bg-gradient-to-r from-foreground/15 to-transparent" />
          </h2>
          <div className="mt-5 overflow-x-auto rounded-none ring-1 ring-foreground/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-foreground/10 bg-card/40 text-foreground">
                <tr>
                  <th className="px-4 py-3 font-mono text-[0.7rem] font-medium uppercase tracking-[0.08em]">
                    What
                  </th>
                  <th className="px-4 py-3 font-mono text-[0.7rem] font-medium uppercase tracking-[0.08em]">
                    Where
                  </th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {PATHS.map(([what, where]) => (
                  <tr key={where} className="border-b border-foreground/10 last:border-0">
                    <td className="px-4 py-3">{what}</td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground sm:text-sm">{where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground">
            On most Linux boxes the data dir is <code className="text-foreground">~/.local/share</code>{" "}
            and the cache is <code className="text-foreground">~/.cache</code>. The store is an
            embedded sqlite database (transactional writes, WAL journal, no server to run), so a
            backup is: stop the service, copy the <code className="text-foreground">.db</code> file
            (plus its <code className="text-foreground">-wal</code> sidecar if present), start it
            again.{" "}
            <Link
              to="/docs/getting-started"
              hash="manual"
              className="text-foreground underline underline-offset-4"
            >
              Step 9 of getting started
            </Link>{" "}
            covers upgrade and rollback semantics.
          </p>
        </section>

        <section>
          <h2 className="text-[0.8rem] font-medium tracking-tight">
            Trust boundary
            <div aria-hidden="true" className="mt-3 h-px flex-1 bg-gradient-to-r from-foreground/15 to-transparent" />
          </h2>
          <div className="mt-5 max-w-prose space-y-4 border-l-2 border-(--pinned-accent) pl-4 text-base leading-relaxed text-muted-foreground">
            <p>
              What talks to the network, exhaustively: the forge sync (an explicit, read-only
              fetch through your own <code className="text-foreground">gh</code> CLI, only when
              you press Sync) and the two on-demand downloads (release upgrades, the code-server
              install). Everything else is local: scans shell out to git, reads never leave the
              sqlite file, reports render from cache.
            </p>
            <p>
              The app is fine on localhost or a trusted LAN. The IDE runs with{" "}
              <code className="text-foreground">--auth none</code>, file routes reject path
              escapes, and the file browser is confined to project subtrees, but none of that
              makes it a fortress. It is a tool for your network; do not hang it on the public
              internet and walk away.
            </p>
          </div>
        </section>
      </div>

      <div className="mt-14 flex flex-wrap gap-2 border-t border-foreground/10 pt-8">
        <Link
          to="/docs/getting-started"
          className="border border-foreground/10 px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
          ← Getting started
        </Link>
        <Link
          to="/docs/concepts"
          className="border border-foreground/10 px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
          How it works →
        </Link>
      </div>
    </PageShell>
  );
}
