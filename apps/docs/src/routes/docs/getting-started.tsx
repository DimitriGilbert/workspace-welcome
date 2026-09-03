import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace-welcome/ui/components/button";

import { SectionHeader } from "@workspace-welcome/ui/components/section-header";

import { PageShell } from "../../components/page-shell";
import { seoHead } from "../../seo";

const installerUrl = "https://welcome-workspace.dbuild.dev/install.sh";
const installCommand = `curl -fsSL ${installerUrl} | sh`;

export const Route = createFileRoute("/docs/getting-started")({
  component: GettingStartedPage,
  head: seoHead({
    title: "Install — welcome-workspace",
    description:
      "Install and run welcome-workspace with one command — a checksum-verified GitHub release and a systemd user service on port 37420.",
    path: "/docs/getting-started",
  }),
});

function CommandBlock({ command }: { command: string }) {
  return (
    <pre className="mt-4 overflow-x-auto border border-border bg-card/40 p-4 font-mono text-sm leading-relaxed text-foreground">
      {command}
    </pre>
  );
}

function GettingStartedPage() {
  return (
    <PageShell
      title="Get it running"
      lead="One command if Node 22+ is already on the machine. The installer does the rest — add a root, watch the scan."
    >
      <div className="max-w-3xl space-y-12">
        <section>
          <SectionHeader title="Install" />
          <CommandBlock command={installCommand} />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            The script installs the latest release and starts it as a systemd user service on port 37420 —
            then open <code className="text-foreground">http://localhost:37420</code> and add a directory
            from the gear icon.
          </p>
        </section>

        <section>
          <SectionHeader title="What the script does" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground">
            <li>Checks Node 22+, curl or wget, and tar</li>
            <li>Resolves the latest GitHub release</li>
            <li>Verifies the download against the SHA256SUMS.txt file that ships with the release</li>
            <li>
              Installs to{" "}
              <code className="text-foreground">~/.local/share/workspace-welcome/app</code>
            </li>
            <li>
              Writes a <code className="text-foreground">.env</code> (PORT, HOST) next to the app
            </li>
            <li>Installs and starts a systemd user service</li>
            <li>Never touches your config — not on install, not on upgrade</li>
          </ul>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Not sure yet? Preview every step without changing anything:
          </p>
          <CommandBlock command={`curl -fsSL ${installerUrl} | sh -s -- --dry-run`} />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Piping curl to sh is a trust decision —{" "}
            <a
              href="https://github.com/DimitriGilbert/workspace-welcome/blob/main/scripts/install.sh"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              read the script
            </a>{" "}
            first if you have not yet.
          </p>
        </section>

        <section>
          <SectionHeader title="Needs" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground">
            <li>Node 22+</li>
            <li>
              Linux with a systemd user session for the service — on macOS the service step is skipped
              automatically (add <code className="text-foreground">--no-service</code> to make that
              explicit) and you start the app yourself with{" "}
              <code className="text-foreground">node serve-prod.mjs</code>
            </li>
            <li>curl or wget</li>
            <li>tar</li>
            <li>
              <code className="text-foreground">git</code> on PATH — the scaffolder and the report
              features shell out to it
            </li>
            <li>
              Optional: <code className="text-foreground">gio</code> so the file browser can trash instead of
              permanently delete
            </li>
          </ul>
        </section>

        <section>
          <SectionHeader title="Manual install" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            For when you will not pipe curl to sh. Every release ships one tarball per platform plus a{" "}
            <code className="text-foreground">SHA256SUMS.txt</code>, named{" "}
            <code className="text-foreground">
              workspace-welcome-&lt;version&gt;-&lt;os&gt;[-musl]-&lt;arch&gt;.tar.gz
            </code>{" "}
            — <code className="text-foreground">workspace-welcome-0.1.0-linux-x64.tar.gz</code> is Linux on
            x86-64. The OS is <code className="text-foreground">linux</code> or{" "}
            <code className="text-foreground">darwin</code>, the arch{" "}
            <code className="text-foreground">x64</code> or{" "}
            <code className="text-foreground">arm64</code>; musl systems (Alpine) add{" "}
            <code className="text-foreground">-musl</code>. The{" "}
            <a
              href="https://github.com/DimitriGilbert/workspace-welcome/releases"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              releases page
            </a>{" "}
            has the current version, and the{" "}
            <code className="text-foreground">releases/latest/download/</code> URLs redirect to whatever
            release is newest.
          </p>
          <CommandBlock
            command={`version=0.1.0
base="https://github.com/DimitriGilbert/workspace-welcome/releases/download/v\${version}"
curl -fLO "\${base}/workspace-welcome-\${version}-linux-x64.tar.gz"
curl -fLO "\${base}/SHA256SUMS.txt"
grep "workspace-welcome-\${version}-linux-x64.tar.gz" SHA256SUMS.txt | sha256sum -c -
tar -xzf "workspace-welcome-\${version}-linux-x64.tar.gz"
cd workspace-welcome
node serve-prod.mjs`}
          />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            <code className="text-foreground">sha256sum -c</code> should print OK (macOS:{" "}
            <code className="text-foreground">shasum -a 256 -c -</code>). The server reads{" "}
            <code className="text-foreground">PORT</code> and{" "}
            <code className="text-foreground">HOST</code> from the environment or a{" "}
            <code className="text-foreground">.env</code> next to{" "}
            <code className="text-foreground">serve-prod.mjs</code> — defaults 37420 and 127.0.0.1. This is
            exactly what the installer automates.
          </p>
        </section>

        <section>
          <SectionHeader title="Managing the service" />
          <CommandBlock
            command={`systemctl --user status workspace-welcome
systemctl --user stop workspace-welcome
systemctl --user start workspace-welcome
systemctl --user restart workspace-welcome`}
          />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">Logs:</p>
          <CommandBlock command="journalctl --user -u workspace-welcome -f" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            To change the port or host, override the Environment lines in the unit. Run{" "}
            <code className="text-foreground">systemctl --user edit workspace-welcome</code> and add:
          </p>
          <CommandBlock command={`[Service]
Environment=PORT=5050`} />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">Then:</p>
          <CommandBlock command={`systemctl --user daemon-reload
systemctl --user restart workspace-welcome`} />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Headless machine? A user service stops at logout unless you enable linger:{" "}
            <code className="text-foreground">sudo loginctl enable-linger $USER</code>
          </p>
        </section>

        <section>
          <SectionHeader title="Upgrading" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Re-run the installer — that is the whole upgrade path. Your{" "}
            <code className="text-foreground">.env</code> and your config survive, and the previous version
            is kept at{" "}
            <code className="text-foreground">~/.local/share/workspace-welcome/app.bak</code> for rollback
            (delete it once you are happy).
          </p>
          <CommandBlock command={installCommand} />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">To pin a version:</p>
          <CommandBlock command={`curl -fsSL ${installerUrl} | sh -s -- --version vX.Y.Z`} />
        </section>

        <section>
          <SectionHeader title="Uninstall" />
          <CommandBlock command={`curl -fsSL ${installerUrl} | sh -s -- --uninstall`} />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            That stops and removes the service and the app. Your config, the report cache, and the
            code-server install survive. When you want all of it gone:
          </p>
          <CommandBlock command={`curl -fsSL ${installerUrl} | sh -s -- --purge --yes`} />
        </section>

        <section>
          <SectionHeader title="Where state lives" />
          <ul className="mt-4 space-y-3 text-base leading-relaxed text-muted-foreground">
            <li>
              App install:{" "}
              <code className="text-foreground">~/.local/share/workspace-welcome/app</code>
            </li>
            <li>
              Config / roots / pins / notes:{" "}
              <code className="text-foreground">$XDG_CONFIG_HOME/workspace-welcome/store.json</code>
            </li>
            <li>
              Report HTML: <code className="text-foreground">$XDG_CACHE_HOME/workspace-welcome/reports/</code>
            </li>
            <li>
              code-server install: <code className="text-foreground">$XDG_DATA_HOME/workspace-welcome/ide/</code>
            </li>
          </ul>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            More on knobs and paths:{" "}
            <Link to="/docs/settings" className="text-foreground underline underline-offset-4">
              Settings &amp; data
            </Link>
            .
          </p>
        </section>

        <section>
          <SectionHeader title="First IDE open" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            “Open IDE” on a project page downloads code-server into the app data dir (~100–200 MB, once). After
            that it is a shared instance — deep-link per project, stop from Settings.
          </p>
        </section>

        <section>
          <SectionHeader title="Developing from source" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Only for contributors — the installer above is how the app is meant to run.
          </p>
          <CommandBlock
            command={`git clone git@github.com:DimitriGilbert/workspace-welcome.git
cd workspace-welcome
pnpm install
pnpm dev`}
          />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            <code className="text-foreground">pnpm dev</code> serves the dashboard on port 37420. Before
            opening a pull request, run <code className="text-foreground">pnpm run check-types</code> and{" "}
            <code className="text-foreground">pnpm build</code>.
          </p>
        </section>

        <section>
          <SectionHeader title="Troubleshooting" />
          <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground">
            <li>
              Port already in use — pick another at install time with{" "}
              <code className="text-foreground">--port</code>, or change{" "}
              <code className="text-foreground">PORT</code> afterwards via the unit override above or the{" "}
              <code className="text-foreground">.env</code> next to{" "}
              <code className="text-foreground">serve-prod.mjs</code>, then restart the service.
            </li>
            <li>
              Service dead after you log out — a user service ends with the session; enable linger (see
              above).
            </li>
            <li>
              Logs live in the journal:{" "}
              <code className="text-foreground">journalctl --user -u workspace-welcome -f</code>
            </li>
            <li>
              A SHA256 mismatch aborts before anything is installed — the download was corrupted, so just
              re-run the installer.
            </li>
          </ul>
        </section>

        <section>
          <SectionHeader title="For the nerds" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            pnpm monorepo. <code className="text-foreground">apps/web</code> is TanStack Start (UI + server
            routes). <code className="text-foreground">packages/api</code> holds tRPC plus the scanner, git,
            scaffold, and IDE bits. <code className="text-foreground">packages/ui</code> is the shared kiln kit
            this site reuses. Scaffolded with Better-T-Stack. No auth, no ORM, no database.
          </p>
        </section>
      </div>

      <div className="mt-14 flex flex-wrap gap-2 border-t border-foreground/10 pt-8">
        <Button render={<Link to="/features" />}>Features</Button>
        <Button variant="outline" render={<Link to="/docs/concepts" />}>
          Concepts
        </Button>
      </div>
    </PageShell>
  );
}
