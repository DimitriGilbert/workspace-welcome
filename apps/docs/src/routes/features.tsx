import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace-welcome/ui/components/button";
import { SectionHeader } from "@workspace-welcome/ui/components/section-header";

import { PageShell } from "../components/page-shell";
import { seoHead } from "../seo";

export const Route = createFileRoute("/features")({
  component: FeaturesPage,
  head: seoHead({
    title: "Features — welcome-workspace",
    description:
      "Not a collaboration cloud. A dashboard for your disk — scan, triage, open, scaffold, report.",
    path: "/features",
  }),
});

const sections = [
  {
    id: "dashboard",
    title: "Dashboard & health",
    paragraphs: [
      "You add roots — directories whose immediate children become projects. The scan fingerprints each one so warm reloads only re-scan what actually moved. On a large workspace that is the difference between usable and coffee-break.",
      "Every project gets dates, stack detection, branch / ahead-behind / dirty / last commit / remote, and health alerts: no remote, diverged, behind, unpushed, dirty, stale WIP (dirty and quiet for 3+ weeks), dormant (90+ days).",
    ],
    bullets: [
      "Needs attention rolls up warn/error and folds away when empty",
      "Pinned section, recency heat over about 90 days, Recent vs Older",
      "Filter with / across name, path, stack, branch, remote, note",
    ],
  },
  {
    id: "project",
    title: "Project workspace",
    paragraphs: [
      "Open a project and you get the day-to-day surface: vitals, a note field for where you left off (the feature I actually use), remote deep links for GitHub / GitLab / Bitbucket / Codeberg / sourcehut, and git actions with a safety probe when switching branches.",
    ],
    bullets: [
      "Fetch all, pull ff-only, push with upstream",
      "Branch switcher and read-only commit history",
      "Quick-open editor, terminal, or folder — editor is configurable; terminal auto-detects common Linux terminals if you leave it blank",
    ],
  },
  {
    id: "reports",
    title: "git-snitch reports",
    paragraphs: [
      "The project page can run a per-repo report; Settings can run a comparative scan across a whole root. HTML is cached under XDG and served at /reports/<key>, so it opens in a new tab from whatever machine is hitting the app.",
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

function FeaturesPage() {
  return (
    <PageShell
      title="What it does"
      lead="Not a collaboration cloud. A dashboard for your disk — scan, triage, open, scaffold, report."
    >
      <nav className="mb-12 flex flex-wrap gap-2">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="border border-foreground/10 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          >
            {section.title}
          </a>
        ))}
      </nav>

      <div className="space-y-14">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24 max-w-3xl">
            <SectionHeader title={section.title} />
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="mt-4 text-base leading-relaxed text-muted-foreground">
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
