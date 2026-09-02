import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace-welcome/ui/components/button";

import { SectionHeader } from "@workspace-welcome/ui/components/section-header";

import { PageShell } from "../../components/page-shell";
import { seoHead } from "../../seo";

export const Route = createFileRoute("/docs/getting-started")({
  component: GettingStartedPage,
  head: seoHead({
    title: "Install — welcome-workspace",
    description:
      "Install and run welcome-workspace: Node 22+, pnpm, and git. Add a root, watch the first scan.",
    path: "/docs/getting-started",
  }),
});

function GettingStartedPage() {
  return (
    <PageShell
      title="Get it running"
      lead="Five minutes if Node and pnpm are already on the machine. Add a root, watch the scan."
    >
      <div className="max-w-3xl space-y-12">
        <section>
          <SectionHeader title="Needs" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground">
            <li>Node 22+</li>
            <li>pnpm</li>
            <li>
              <code className="text-foreground">git</code> on PATH
            </li>
            <li>
              Optional: <code className="text-foreground">gio</code> so the file browser can trash instead of
              permanently delete
            </li>
          </ul>
        </section>

        <section>
          <SectionHeader title="Install & run" />
          <pre className="mt-4 overflow-x-auto border border-border bg-card/40 p-4 font-mono text-sm leading-relaxed text-foreground">
            {`git clone git@github.com:DimitriGilbert/workspace-welcome.git
cd workspace-welcome
pnpm install
pnpm dev`}
          </pre>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Open <code className="text-foreground">http://localhost:37420</code>. Gear icon → add a directory.
            Projects show up as the scan runs. Prefer only the app with{" "}
            <code className="text-foreground">pnpm dev:web</code> — port is set in{" "}
            <code className="text-foreground">apps/web/vite.config.ts</code> (37420).
          </p>
        </section>

        <section>
          <SectionHeader title="First IDE open" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            “Open IDE” on a project page downloads code-server into the app data dir (~100–200 MB, once). After
            that it is a shared instance — deep-link per project, stop from Settings.
          </p>
        </section>

        <section>
          <SectionHeader title="Where state lives" />
          <ul className="mt-4 space-y-3 text-base leading-relaxed text-muted-foreground">
            <li>
              Config / roots / pins / notes:{" "}
              <code className="text-foreground">$XDG_CONFIG_HOME/workspace-welcome/store.json</code>
            </li>
            <li>
              Report HTML: <code className="text-foreground">$XDG_CACHE_HOME/workspace-welcome/reports/</code>
            </li>
            <li>
              code-server install: <code className="text-foreground">$XDG_DATA_HOME/workspace-welcome/ide/</code>
            </li>
          </ul>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            More on knobs and paths:{" "}
            <Link to="/docs/settings" className="text-foreground underline underline-offset-4">
              Settings &amp; data
            </Link>
            .
          </p>
        </section>

        <section>
          <SectionHeader title="For the nerds" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            pnpm monorepo. <code className="text-foreground">apps/web</code> is TanStack Start (UI + server
            routes). <code className="text-foreground">packages/api</code> holds tRPC plus the scanner, git,
            scaffold, and IDE bits. <code className="text-foreground">packages/ui</code> is the shared kiln kit
            this site reuses. Scaffolded with Better-T-Stack. No auth, no ORM, no database.
          </p>
        </section>
      </div>

      <div className="mt-14 flex flex-wrap gap-2 border-t border-foreground/10 pt-8">
        <Button render={<Link to="/features" />}>Features</Button>
        <Button variant="outline" render={<Link to="/docs/concepts" />}>
          Concepts
        </Button>
      </div>
    </PageShell>
  );
}
