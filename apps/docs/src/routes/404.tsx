import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace-welcome/ui/components/button";
import { PageRail } from "@workspace-welcome/ui/components/page-rail";

export const Route = createFileRoute("/404")({
  component: NotFoundPage,
  head: () => ({
    meta: [{ title: "Not found — welcome-workspace" }],
  }),
});

function NotFoundPage() {
  return (
    <PageRail className="pb-10 pt-8">
      <h1 className="text-2xl font-semibold tracking-tight">Nothing here</h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">
        That path isn&apos;t on this site. Maybe it moved, maybe it never existed.
      </p>
      <Button className="mt-6" render={<Link to="/" />}>
        Home
      </Button>
    </PageRail>
  );
}
