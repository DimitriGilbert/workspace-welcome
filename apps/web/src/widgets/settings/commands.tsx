import { useEffect, useState } from "react";

import { Button } from "@workspace-welcome/ui/components/button";
import { Input } from "@workspace-welcome/ui/components/input";
import { Label } from "@workspace-welcome/ui/components/label";

import { useSettings } from "@/widgets/contexts/settings-context";
import { WidgetShell } from "@/components/widgets/widget-shell";

/**
 * SettingsCommands — editor + terminal open commands (the /settings page's
 * common widget for them). Local drafts hydrate from the settings query and
 * Save writes through {@link useSettings}'s `update` wrapper: editor +
 * terminal as edited, every other field passed through untouched (the update
 * replaces the whole settings object), ideation omitted so the stored block
 * carries forward. Dirty gating, invalidation, and toasts are the legacy
 * settings page's exact contract.
 */
export function SettingsCommands() {
  const { settings, update, saving } = useSettings();
  const data = settings.data;

  const [editor, setEditor] = useState("");
  const [terminal, setTerminal] = useState("");

  // Hydrate local state once settings load (and after each persisted save).
  useEffect(() => {
    if (data) {
      setEditor(data.editorCommand);
      setTerminal(data.terminalCommand ?? "");
    }
  }, [data]);

  const dirty =
    data !== undefined &&
    (editor !== data.editorCommand ||
      (terminal || null) !== (data.terminalCommand ?? null));

  return (
    <WidgetShell title="Open commands" className="border bg-card">
      <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Commands used by the quick-open actions. The project path is passed
          as the last argument.
        </p>
        <div className="flex flex-col gap-1">
          <Label htmlFor="editor-cmd">Editor command</Label>
          <Input
            id="editor-cmd"
            value={editor}
            onChange={(e) => setEditor(e.target.value)}
            placeholder="code"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            e.g. <span className="font-mono">code</span>,{" "}
            <span className="font-mono">cursor</span>,{" "}
            <span className="font-mono">zed</span>
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="terminal-cmd">Terminal command (optional)</Label>
          <Input
            id="terminal-cmd"
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
            placeholder="kitty"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Launched with{" "}
            <span className="font-mono">--working-directory {"<path>"}</span>.
          </p>
        </div>
        <Button
          className="w-fit"
          disabled={!dirty || saving}
          onClick={() =>
            update({
              editorCommand: editor,
              terminalCommand: terminal.trim() ? terminal : null,
              snitchPath: data?.snitchPath ?? null,
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
