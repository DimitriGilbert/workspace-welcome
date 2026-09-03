import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace-welcome/ui/components/button";
import { PageRail } from "@workspace-welcome/ui/components/page-rail";
import { SectionHeader } from "@workspace-welcome/ui/components/section-header";

import { seoHead } from "../seo";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: seoHead({
    title: "welcome-workspace",
    description:
      "A local dashboard for people with too many projects. Scans git, stack, and health. No accounts, no cloud.",
    path: "/",
  }),
});

function HomePage() {
  return (
    <PageRail className="pb-12 pt-8">
      <section className="grid gap-10 border-b border-foreground/10 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-end lg:gap-14">
        <div>
          <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            A local dashboard for people with too many projects
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Point it at the folders where your projects live. It scans them, figures out the git state, guesses
            the stack, and gives you one screen for the Monday-morning question: what was I doing, and
            what&apos;s falling apart?
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            No accounts, no database, no cloud. It runs on your machine and reads your filesystem.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Button render={<Link to="/docs/getting-started" />}>Get it running</Button>
            <Button variant="outline" render={<Link to="/features" />}>
              What it does
            </Button>
          </div>
        </div>

        <figure className="overflow-hidden ring-1 ring-foreground/10">
          <img
            src="/dashboard.png"
            alt="welcome-workspace dashboard with needs-attention alerts and recent projects"
            className="block h-auto w-full bg-card"
            width={1440}
            height={728}
          />
        </figure>
      </section>

      <section className="mt-12 grid gap-10 lg:grid-cols-2">
        <div>
          <SectionHeader title="Why it exists" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            My projects folder was a mess. Twenty-odd repos, half with uncommitted changes rotting for weeks,
            three with no remote, one I hadn&apos;t touched in a year. The folder view told me none of that. I
            wanted a screen that surfaced the stale WIP and the diverged branches without{" "}
            <code className="text-foreground">cd</code>-ing into each one for{" "}
            <code className="text-foreground">git status</code>.
          </p>
        </div>
        <div>
          <SectionHeader title="What you get" />
          <ul className="mt-4 space-y-3 text-base leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Health that rolls up.</span> Dirty trees, diverged
              branches, behind remotes, stale WIP, dormant repos. Needs attention keeps the warn/error stuff
              where you can act on it.
            </li>
            <li>
              <span className="font-medium text-foreground">A real project page.</span> Notes for where you left
              off, fetch/pull/push, file browser, git-snitch reports, open in editor/terminal, or a browser IDE.
            </li>
            <li>
              <span className="font-medium text-foreground">Scaffolding when you need a new one.</span> Create a
              better-t-stack project into a tracked root, or export a clone script for the next machine.
            </li>
          </ul>
        </div>
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
