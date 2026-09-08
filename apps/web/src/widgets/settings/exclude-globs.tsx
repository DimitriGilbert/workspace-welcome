import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";
import { Input } from "@workspace-welcome/ui/components/input";
import { Label } from "@workspace-welcome/ui/components/label";

import { useSettings } from "@/widgets/contexts/settings-context";
import { WidgetShell } from "@/components/widgets/widget-shell";

/**
 * SettingsExcludeGlobs — the scan exclude-glob list as a /settings page
 * common widget. Globs are directory names skipped when computing updatedAt;
 * `excludeGlobs` feeds the scan denylist, so a save drops the scan cache
 * server-side. Editing is a draft list (append via the input, remove per
 * row); Save writes the whole array through the settings context with every
 * other field passed through — the update's replace-whole semantics. Dirty
 * gating, invalidation, and toasts are the legacy settings page's contract.
 */
export function SettingsExcludeGlobs() {
  const { settings, update, saving } = useSettings();
  const data = settings.data;

  const [globs, setGlobs] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  // Hydrate the draft list once settings load (and after each saved save).
  useEffect(() => {
    if (data) {
      setGlobs(data.excludeGlobs);
    }
  }, [data]);

  const dirty =
    data !== undefined &&
    (globs.length !== data.excludeGlobs.length ||
      globs.some((glob, index) => glob !== data.excludeGlobs[index]));

  const appendDraft = () => {
    const value = draft.trim();
    if (value.length === 0 || globs.includes(value)) {
      setDraft("");
      return;
    }
    setGlobs((current) => [...current, value]);
    setDraft("");
  };

  return (
    <WidgetShell title="Exclude globs" className="border bg-card">
      <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Directory names skipped when computing project activity —{" "}
          <span className="font-mono">node_modules</span>-style entries,
          gitignore-style globs.
        </p>
        {globs.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {globs.map((glob, index) => (
              <li
                key={glob}
                className="flex items-center justify-between gap-2 border px-2 py-1"
              >
                <span className="truncate font-mono text-xs">{glob}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${glob}`}
                  onClick={() =>
                    setGlobs((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No extra globs.</p>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            appendDraft();
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor="exclude-glob-add">Add a glob</Label>
            <Input
              id="exclude-glob-add"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="dist"
              className="font-mono"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={draft.trim().length === 0}>
            <Plus className="size-3.5" /> Add
          </Button>
        </form>
        <Button
          className="w-fit"
          disabled={!dirty || saving}
          onClick={() =>
            update({
              editorCommand: data?.editorCommand ?? "",
              terminalCommand: data?.terminalCommand ?? null,
              snitchPath: data?.snitchPath ?? null,
              excludeGlobs: globs,
            })
          }
        >
          Save
        </Button>
      </div>
    </WidgetShell>
  );
}
