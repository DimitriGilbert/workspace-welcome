import { useEffect, useState } from "react";

import { Button } from "@workspace-welcome/ui/components/button";
import { Input } from "@workspace-welcome/ui/components/input";
import { Label } from "@workspace-welcome/ui/components/label";

import { useSettings } from "@/widgets/contexts/settings-context";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/**
 * SettingsSnitch — the gitsnitch CLI path (ADR-0001) as a /settings page
 * common widget. Blank keeps auto-resolve (local ~/workspace/gitsnitch build
 * if present, else npx); a value runs `node <path>`. Save writes through the
 * settings context with every other field passed through; dirty gating,
 * invalidation, and toasts are the legacy settings page's contract.
 */
export function SettingsSnitch() {
  const { settings, update, saving } = useSettings();
  const data = settings.data;

  const [snitch, setSnitch] = useState("");

  // Hydrate local state once settings load (and after each persisted save).
  useEffect(() => {
    if (data) {
      setSnitch(data.snitchPath ?? "");
    }
  }, [data]);

  const dirty =
    data !== undefined &&
    (snitch || null) !== (data.snitchPath ?? null);

  return (
    <WidgetShell title="gitsnitch" className="border bg-card">
      <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
        <div className="flex flex-col gap-1">
          <Label htmlFor="snitch-path">gitsnitch CLI path (optional)</Label>
          <Input
            id="snitch-path"
            value={snitch}
            onChange={(e) => setSnitch(e.target.value)}
            placeholder="~/workspace/gitsnitch/apps/cli/dist/index.js"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Blank = auto (local{" "}
            <span className="font-mono">~/workspace/gitsnitch</span> build if
            present, else <span className="font-mono">npx @git-snitch/cli</span>
            ); when set the app runs{" "}
            <span className="font-mono">node {"<path>"}</span>.
          </p>
        </div>
        <Button
          className="w-fit"
          disabled={!dirty || saving}
          onClick={() =>
            update({
              editorCommand: data?.editorCommand ?? "",
              terminalCommand: data?.terminalCommand ?? null,
              snitchPath: snitch.trim() ? snitch : null,
              excludeGlobs: data?.excludeGlobs ?? [],
            })
          }
        >
          Save
        </Button>
      </div>
    </WidgetShell>
  );
}
