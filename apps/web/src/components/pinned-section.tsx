import type { Project } from "@workspace-welcome/api/lib/types";

import { ProjectCard } from "@/components/project-card";
import { SectionHeader } from "@/components/section-header";

interface PinnedSectionProps {
  projects: Project[];
  onOpenDetail: (project: Project) => void;
}

/**
 * Pinned projects get their own elevated surface: a panel with the amber
 * accent wash, separated from the recency grid by a section header. Cards
 * inside use accentMode="pinned" so the left border matches the panel and
 * doesn't compete with the recency ramp in the main grid.
 *
 * Wider 2-column grid (vs 3-4 in the main grid) because pinned projects
 * deserve more room — they're the ones the user reaches for.
 */
export function PinnedSection({ projects, onOpenDetail }: PinnedSectionProps) {
  if (projects.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        eyebrow="Pinned"
        count={projects.length}
        accent="pinned"
        title="Kept close"
      />
      <div
        className="grid grid-cols-1 gap-3 rounded-none border border-[color-mix(in_oklch,var(--pinned-accent)_25%,transparent)] p-3 sm:grid-cols-2"
        style={{ backgroundColor: "var(--pinned-accent-wash)" }}
      >
        {projects.map((p) => (
          <ProjectCard
            key={p.path}
            project={p}
            onOpenDetail={onOpenDetail}
            accentMode="pinned"
          />
        ))}
      </div>
    </section>
  );
}
