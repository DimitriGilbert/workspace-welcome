import type { Project } from "@workspace-welcome/api/lib/types";

import { ProjectCard } from "@/components/project-card";
import { SectionHeader } from "@/components/section-header";

interface PinnedSectionProps {
  projects: Project[];
}

/**
 * Pinned projects, in their own section above the recency grid. No special
 * panel or accent wash: the section header and the pin glyph on each card
 * carry the distinction.
 */
export function PinnedSection({ projects }: PinnedSectionProps) {
  if (projects.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Pinned" count={projects.length} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((p) => (
          <ProjectCard key={p.path} project={p} />
        ))}
      </div>
    </section>
  );
}
