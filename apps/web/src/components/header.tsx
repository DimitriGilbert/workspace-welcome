import { Link } from "@tanstack/react-router";
import { Folder, Settings } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";

export default function Header() {
  return (
    <div>
      <div className="flex flex-row items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Folder className="size-4 text-primary" />
          <Link to="/" className="text-sm font-semibold tracking-tight">
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
      <hr />
    </div>
  );
}
