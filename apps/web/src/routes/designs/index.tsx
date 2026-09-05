import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FlaskConical } from "lucide-react";

import { Badge } from "@workspace-welcome/ui/components/badge";
import { MastheadRow, PageRail } from "@workspace-welcome/ui/components/page-rail";
import { WorkspaceBrand } from "@workspace-welcome/ui/components/workspace-brand";

export const Route = createFileRoute("/designs/")({
  component: DesignsIndexPage,
});

interface Concept {
  to:
    | "/designs/bento"
    | "/designs/ledger"
    | "/designs/meadow"
    | "/designs/mission-bento"
    | "/designs/mission-control"
    | "/designs/swiss";
  name: string;
  theme: "Dark" | "Light";
  register: string;
  tagline: string;
}

const CONCEPTS: Concept[] = [
  {
    to: "/designs/mission-control",
    name: "Mission Control",
    theme: "Dark",
    register: "ops-room command center",
    tagline: "Nav rail, live project stage, analytics column. Mono display faces, sparklines, severity triage — terminal-grade density.",
  },
  {
    to: "/designs/mission-bento",
    name: "Mission Bento",
    theme: "Dark",
    register: "console × mosaic hybrid",
    tagline: "Mission Control's console aesthetic carrying Bento's recency-sized project mosaic — the two originals, fused.",
  },
  {
    to: "/designs/ledger",
    name: "Ledger",
    theme: "Light",
    register: "editorial annual report",
    tagline: "Paper, ink, hairline rules, oversized numerals. The portfolio as a typeset index — tables over cards, marginalia over margins.",
  },
  {
    to: "/designs/bento",
    name: "Bento",
    theme: "Dark",
    register: "glazed widget mosaic",
    tagline: "Asymmetric bento grid in the Linear/Vercel register: KPI tiles with charts, featured attention panel, sparklined project tiles.",
  },
  {
    to: "/designs/swiss",
    name: "Swiss",
    theme: "Light",
    register: "international print grid",
    tagline: "White paper, black ink, one red. Visible modular grid, poster numerals, zero radius, edge-to-edge tables at full-bleed.",
  },
  {
    to: "/designs/meadow",
    name: "Meadow",
    theme: "Light",
    register: "soft daylight calm",
    tagline: "Warm bright surfaces, layered shadows, pastel severity, gentle area charts — consumer-app calm that stays data-forward.",
  },
];

function DesignsIndexPage() {
  return (
    <PageRail className="py-8">
      <header className="flex flex-col gap-5">
        <MastheadRow
          brand={<WorkspaceBrand render={<Link to="/" />} />}
          trailing={
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Current dashboard <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <div className="flex items-center gap-2 border-b border-foreground/10 pb-5">
          <FlaskConical className="size-4 text-eyebrow" />
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-eyebrow">
            Concept gallery
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Dashboard redesign proposals
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Five independent concepts for the projects dashboard, composed for a
            3440&times;1440 canvas. Each one is a self-contained route rendering
            live scanner data with wired actions — pick a favorite, or lift
            sections from several.
          </p>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CONCEPTS.map((concept) => (
          <Link
            key={concept.to}
            to={concept.to}
            className="group flex flex-col gap-3 rounded-lg border border-foreground/10 bg-card p-5 transition-colors hover:border-foreground/25 hover:bg-muted/40"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold tracking-tight">
                {concept.name}
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{concept.theme}</Badge>
              <span className="font-mono text-[0.7rem] uppercase tracking-wider text-eyebrow">
                {concept.register}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {concept.tagline}
            </p>
          </Link>
        ))}

        <div className="flex flex-col justify-center gap-2 rounded-lg border border-dashed border-foreground/15 p-5">
          <p className="font-mono text-[0.7rem] uppercase tracking-wider text-eyebrow">
            About the gallery
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Five independent agents, five briefs. Three worked from the
            design-taste-frontend skill; two trusted their own judgment. All
            data is real, all actions are wired.
          </p>
        </div>
      </div>
    </PageRail>
  );
}
