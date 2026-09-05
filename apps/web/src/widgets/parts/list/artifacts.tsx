import { ArtifactsPanel } from "@/components/artifacts";

import { useProject } from "@/widgets/contexts/project-context";

/**
 * ArtifactsList — the project artifact gallery as a part (master plan
 * §3.5). A thin wrapper over the shared `ArtifactsPanel` (which keeps its
 * own container-independent `artifacts.*` queries — leaf parts fetch,
 * contexts provide scope): the path comes from `useProject()`, nothing else.
 */
export function ArtifactsList() {
  const path = useProject().path;
  return <ArtifactsPanel project={path} />;
}
