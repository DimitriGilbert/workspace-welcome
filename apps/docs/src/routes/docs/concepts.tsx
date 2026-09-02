import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace-welcome/ui/components/button";

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
    body: "A configured directory whose immediate subdirectories become projects. Stored in the local JSON store; edit in Settings.",
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
    name: "Report",
    body: "A self-contained HTML file from git-snitch. Project report for one repo; root report for a comparative scan under a root. Regenerating overwrites the previous file for that key.",
  },
  {
    name: "File browser",
    body: "Per-project lazy listing with upload / rename / delete / new folder / download. Confined to the project subtree — cannot escape the project root.",
  },
  {
    name: "IDE server",
    body: "A code-server child process spawned on demand. Shared instance; per-project open uses ?folder=. Auto-installs on first use. Stop from Settings.",
  },
] as const;

function ConceptsPage() {
  return (
    <PageShell
      title="Words the app uses"
      lead="Short glossary so Settings, the dashboard, and the feature pages mean the same thing."
    >
      <dl className="grid max-w-4xl gap-8 sm:grid-cols-2">
        {terms.map((term) => (
          <div key={term.name}>
            <dt className="text-lg font-semibold tracking-tight text-foreground">{term.name}</dt>
            <dd className="mt-2 text-base leading-relaxed text-muted-foreground">{term.body}</dd>
          </div>
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
