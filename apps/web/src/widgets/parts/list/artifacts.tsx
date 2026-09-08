import type { ComponentPropsWithoutRef } from "react";

import { ArtifactsPanel } from "@/components/artifacts";

import { useProject } from "@/lib/contexts/project-context";

/**
 * ArtifactsList — the project artifact gallery as a part (master plan
 * §3.5). A thin wrapper over the shared `ArtifactsPanel` (which keeps its
 * own container-independent `artifacts.*` queries — leaf parts fetch,
 * contexts provide scope): the path comes from `useProject()`, nothing
 * else. Rest props (definePart's data-part stamps, caller className/style)
 * forward through ArtifactsPanel onto its Card root.
 */
export function ArtifactsList({
  className,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  const path = useProject().path;
  return (
    <ArtifactsPanel project={path} className={className} {...rest} />
  );
}
