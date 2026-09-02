import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace-welcome/ui/components/button";

import { SectionHeader } from "@workspace-welcome/ui/components/section-header";

import { PageShell } from "../../components/page-shell";
import { seoHead } from "../../seo";

export const Route = createFileRoute("/docs/settings")({
  component: SettingsDocsPage,
  head: seoHead({
    title: "Settings — welcome-workspace",
    description:
      "Settings knobs and on-disk paths for welcome-workspace. Nothing leaves the machine that runs the app.",
    path: "/docs/settings",
  }),
});

function SettingsDocsPage() {
  return (
    <PageShell
      title="Settings & data"
      lead="Knobs in the UI, paths on disk. Nothing here leaves the machine that runs the app."
    >
      <div className="max-w-3xl space-y-12">
        <section>
          <SectionHeader title="In Settings" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground">
            <li>Add / remove roots. Removing a root drops overrides under it.</li>
            <li>Restore hidden projects.</li>
            <li>Editor command (code, cursor, zed, …).</li>
            <li>
              Terminal command — or leave empty and let it pick the first it finds from common Linux terminals
              (konsole, gnome-terminal, kitty, alacritty, and friends).
            </li>
            <li>git-snitch command path (local build preferred, npx fallback).</li>
            <li>Per-root comparative report button.</li>
            <li>IDE status + stop for the shared code-server instance.</li>
          </ul>
        </section>

        <section>
          <SectionHeader title="On disk" />
          <div className="mt-4 overflow-x-auto ring-1 ring-foreground/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-foreground/10 bg-card/40 text-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">What</th>
                  <th className="px-4 py-3 font-medium">Where</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-foreground/10">
                  <td className="px-4 py-3">Roots, pins, notes, hide, open commands</td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground sm:text-sm">
                    $XDG_CONFIG_HOME/workspace-welcome/store.json
                  </td>
                </tr>
                <tr className="border-b border-foreground/10">
                  <td className="px-4 py-3">Report HTML cache</td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground sm:text-sm">
                    $XDG_CACHE_HOME/workspace-welcome/reports/
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">code-server install</td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground sm:text-sm">
                    $XDG_DATA_HOME/workspace-welcome/ide/
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            On most Linux boxes that is under <code className="text-foreground">~/.config</code>,{" "}
            <code className="text-foreground">~/.cache</code>, and{" "}
            <code className="text-foreground">~/.local/share</code>. Store writes are atomic.
          </p>
        </section>

        <section>
          <SectionHeader title="Trust boundary" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            The app is fine on localhost or a trusted LAN. The IDE runs with{" "}
            <code className="text-foreground">--auth none</code>. File routes reject path escapes. Still: do not
            hang this on the public internet and walk away. It is a tool for your network, not a fortress.
          </p>
        </section>
      </div>

      <div className="mt-14 flex flex-wrap gap-2 border-t border-foreground/10 pt-8">
        <Button render={<Link to="/docs/getting-started" />}>Install</Button>
        <Button variant="outline" render={<Link to="/docs/concepts" />}>
          Concepts
        </Button>
      </div>
    </PageShell>
  );
}
