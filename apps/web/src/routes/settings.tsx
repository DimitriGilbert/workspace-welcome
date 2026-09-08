import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@workspace-welcome/ui/components/button";

import { SettingsProvider } from "@/lib/contexts/settings-context";
import {
  SettingsCommands,
  SettingsExcludeGlobs,
  SettingsGeneral,
  SettingsIdeation,
  SettingsSnitch,
} from "@/widgets/settings";

/**
 * The /settings page, rebuilt on the widget system: a SettingsProvider
 * (the §3.4 settings view — sole sanctioned `settings.update` write path)
 * with the theme-agnostic settings widgets stacked as quiet token boxes.
 * No ThemeScope — settings is common surface, styled by tokens only; every
 * theme's dashboard links here.
 */
export const Route = createFileRoute("/settings")({
  component: SettingsComponent,
});

function SettingsComponent() {
  return (
    <SettingsProvider>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-4">
        <header className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" render={<Link to="/" />}>
            <ArrowLeft className="size-3.5" />
          </Button>
          <h1 className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
            Settings
          </h1>
        </header>
        <SettingsGeneral />
        <SettingsCommands />
        <SettingsSnitch />
        <SettingsExcludeGlobs />
        <SettingsIdeation />
      </div>
    </SettingsProvider>
  );
}
