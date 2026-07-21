import { Link } from "@tanstack/react-router";
import { Folder, Settings } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";

export default function Header() {
  return (
    <header className="border-b border-foreground/10">
      <div className="mx-auto flex w-full max-w-[1480px] flex-row items-center justify-between px-5 py-2.5 sm:px-8 lg:px-10">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex size-5 items-center justify-center rounded-none"
            style={{
              color: "var(--recency-fresh)",
              backgroundColor:
                "color-mix(in oklch, var(--recency-fresh) 14%, transparent)",
            }}
          >
            <Folder className="size-3.5" />
          </span>
          <Link
            to="/"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Workspace Welcome
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link to="/settings" />}
            aria-label="Settings"
          >
            <Settings className="size-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
