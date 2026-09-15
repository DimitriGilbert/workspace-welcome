import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace-welcome/ui/components/button";

import { Card } from "@workspace-welcome/ui/components/card";

import { PageShell } from "../../components/page-shell";
import { seoHead } from "../../seo";

export const Route = createFileRoute("/docs/concepts")({
  component: ConceptsPage,
  head: seoHead({
    title: "Concepts — welcome-workspace",
    description:
      "The words welcome-workspace uses: Root, Project, Scan, Report, file browser, IDE server.",
    path: "/docs/concepts",
  }),
});

const terms = [
  {
    name: "Root",
    body: "A configured directory whose immediate subdirectories become projects. Stored in the local sqlite store; edit in Settings.",
  },
  {
    name: "Project",
    body: "One scanned subdirectory of a root: filesystem metadata, git state, stack, alerts, plus overrides (pin / note / hide / last-opened).",
  },
  {
    name: "Scan",
    body: "The cached pass over all roots that produces project state. Fingerprints decide which projects get re-scanned.",
  },
  {
    name: "Theme",
    body: "One dashboard/project board: bento, meadow, or mission-control. Each ships a light and a dark scheme; the picker's choice persists and ?preset= deep-links a specific one.",
  },
  {
    name: "Forge",
    body: "A code-hosting backend (GitHub today; Gitea and GitLab reserved). A project's forge identity comes from its git remote — host plus owner/repo slug.",
  },
  {
    name: "Forge sync",
    body: "The explicit, user-triggered fetch behind every Sync button. Nothing auto-syncs; the server enforces a minimum interval, dedupes in-flight work, and runs one fetch at a time through your gh CLI.",
  },
  {
    name: "Forge snapshot & chips",
    body: "A repo's open issues/PRs as of the last sync, cached in sqlite — reads never touch the network. Chips on project surfaces show the counts; a list that hit the page limit renders 50+, never a fabricated zero.",
  },
  {
    name: "Feed",
    body: "The dashboard's cross-repo 'My issues & pull requests' board: the signed-in account's open items across every GitHub repository, workspace or not. Sync it from the widget itself.",
  },
  {
    name: "Report",
    body: "A self-contained HTML file from git-snitch. Project report for one repo; root report for a comparative scan under a root. Regenerating overwrites the previous file for that key.",
  },
  {
    name: "File browser",
    body: "Per-project lazy listing with upload / rename / delete / new folder / download. Confined to the project subtree — cannot escape the project root.",
  },
  {
    name: "Artifact folders",
    body: "Per-project paths marking where build/test media (screenshots, videos) lands. Configured on the project page's Artifacts tab; the viewer streams files with range support.",
  },
  {
    name: "Ideation",
    body: "The per-project AI interview: grills an idea one question at a time, then generates a PRD and an implementation plan into the project's docs/. Sessions persist under .ideadump/ in the project.",
  },
  {
    name: "IDE server",
    body: "A code-server child process spawned on demand. Shared instance; per-project open uses ?folder=. Auto-installs on first use. Stop from Settings.",
  },
] as const;

function ConceptsPage() {
  return (
    <PageShell
      kicker="docs / concepts"
      title="Words the app uses"
      lead="Short glossary so Settings, the dashboard, and the feature pages mean the same thing."
    >
      <dl className="grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {terms.map((term) => (
          <Card key={term.name} size="sm" className="gap-1.5">
            <dt className="px-3 text-sm font-medium tracking-tight text-foreground">{term.name}</dt>
            <dd className="px-3 text-xs/relaxed text-muted-foreground">{term.body}</dd>
          </Card>
        ))}
      </dl>

      <div className="mt-14 flex flex-wrap gap-2 border-t border-foreground/10 pt-8">
        <Button render={<Link to="/docs/getting-started" />}>Install</Button>
        <Button variant="outline" render={<Link to="/docs/settings" />}>
          Settings &amp; data
        </Button>
      </div>
    </PageShell>
  );
}
