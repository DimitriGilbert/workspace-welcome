import { Link } from "@tanstack/react-router";
import { PageRail } from "@workspace-welcome/ui/components/page-rail";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-foreground/10">
      <PageRail className="flex flex-col gap-3 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>welcome-workspace — local dashboard for the folder where your projects live.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/features" className="hover:text-foreground">
            features
          </Link>
          <Link to="/docs/getting-started" className="hover:text-foreground">
            install
          </Link>
          <Link to="/docs/settings" className="hover:text-foreground">
            settings
          </Link>
          <a
            href="https://github.com/DimitriGilbert/workspace-welcome"
            className="hover:text-foreground"
            rel="noreferrer"
            target="_blank"
          >
            source
          </a>
          <a href="https://dbuild.dev" className="hover:text-foreground" rel="noreferrer" target="_blank">
            dbuild.dev
          </a>
        </div>
      </PageRail>
    </footer>
  );
}
