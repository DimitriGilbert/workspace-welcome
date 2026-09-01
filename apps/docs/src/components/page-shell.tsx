import type { ReactNode } from "react";

import { PageRail } from "@workspace-welcome/ui/components/page-rail";

/** Content under the shared masthead — same rail as apps/web. */
export function PageShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <PageRail className="pb-10 pt-8">
      <header className="mb-10 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {lead ? <p className="mt-3 text-base leading-relaxed text-muted-foreground">{lead}</p> : null}
      </header>
      {children}
    </PageRail>
  );
}
