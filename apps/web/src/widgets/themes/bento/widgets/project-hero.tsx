/**
 * Bento's project hero band — ports of `components/designs/bento/
 * project-page.tsx`'s overview band: the glazed nav bar (back + live git
 * status), the identity tile, and the GROUPED state tile (git controls and
 * the last commit together — the owner-mandated grouping).
 *
 * Interactive git rides the provider stack (§3.4): the git quintet and IDE
 * choreography come from `useProject()`; the branch switcher and actions
 * toolbar are the system's parts (the same flows the design wired by hand).
 * The design's pin toggle needs procedure access the theme namespace
 * lacks — pinned state still displays (the chip), toggling lives in the
 * core dashboard.
 */
import { type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  CodeXml,
  ExternalLink as ExternalLinkIcon,
  FileText,
  Folder,
  History,
  Images,
  Loader2,
  MessagesSquare,
  Package,
  Terminal as TerminalIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@workspace-welcome/ui/components/button";
import { Textarea } from "@workspace-welcome/ui/components/textarea";

import { AlertBadge } from "@/components/git-badges";
import { absoluteDate, relativeTime } from "@/lib/format";

import { setSurfaceTab } from "../surface-tabs";
import { hostLabel, stackIcon } from "@/lib/icons";
import { freshness } from "@/lib/recency";
import { useReportRun } from "@/lib/use-report";

import { BranchSwitcherPart, GitActionsToolbarPart } from "@/widgets/parts";
import { useProject } from "@/widgets/contexts/project-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";

import { BentoTile, GitGlyphs, RecencyRing } from "../bits";

/** The "right behind it" window — the provider's cached log, newest first. */
const RECENT_COMMITS = 4;

/* ------------------------------------------------------------ helpers --- */

/** The design's mono-caps eyebrow register (`b-label`). */
function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="b-label">{children}</span>;
}

/** One label/value row of the design's meta register. */
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="b-label">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[0.72rem] text-foreground/90" title={value}>
        {value}
      </dd>
    </div>
  );
}

/* ---------------------------------------------------------------- nav --- */

/** The nav's section register: the design's tabs (icon + label), the region
 * each one scrolls to, and — for the working-surface trio — the pane the
 * surface widget brings forward (the prototype's tab structure). */
const NAV_SECTIONS: readonly {
  label: string;
  icon: typeof Folder;
  region: string;
  pane?: "files" | "artifacts" | "ideation";
}[] = [
  { label: "Overview", icon: Package, region: "hero" },
  { label: "Pulse", icon: Activity, region: "pulse" },
  { label: "Files", icon: Folder, region: "surface", pane: "files" },
  { label: "Artifacts", icon: Images, region: "surface", pane: "artifacts" },
  { label: "Ideation", icon: MessagesSquare, region: "surface", pane: "ideation" },
  { label: "History", icon: History, region: "commits" },
];

/**
 * The project nav bar: the design's full-width glazed bar — back to the
 * dashboard, the page's section tabs, and the project's live git status on
 * the right. The board shows the sections as regions, so the tabs scroll
 * to their region (the Files/Artifacts/Ideation trio shares the surface).
 */
export function BentoProjectNav(_props: RegisteredWidgetProps) {
  const { project } = useProject();

  const scrollTo = (region: string, pane?: "files" | "artifacts" | "ideation") => {
    if (pane !== undefined) setSurfaceTab(pane);
    document.querySelector(`[data-region="${region}"]`)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col justify-center gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button variant="ghost" size="sm" render={<Link to="/app/$theme" params={{ theme: "bento" }} />} aria-label="Back to bento dashboard">
        <ArrowLeft className="size-3.5" /> bento
      </Button>
      <nav className="hidden max-w-full items-center gap-1 md:flex" aria-label="Project sections">
        {NAV_SECTIONS.map((section) => (
          <button
            key={section.label}
            type="button"
            onClick={() => scrollTo(section.region, section.pane)}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[0.66rem] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <section.icon className="size-3" /> {section.label}
          </button>
        ))}
      </nav>
      <span className="ml-auto hidden shrink-0 items-center gap-2 font-mono text-[0.62rem] text-muted-foreground/80 lg:flex">
        {project?.git.isRepo ? <GitGlyphs git={project.git} /> : null}
        <span>updated {project !== null ? relativeTime(project.updatedAt) : "—"}</span>
      </span>
      </div>
      {project !== null && project.alerts.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {project.alerts.map((a) => (
            <AlertBadge key={a.code} severity={a.severity} message={a.message} />
          ))}
        </div>
      ) : null}
    </BentoTile>
  );
}

/* ------------------------------------------------------------ identity --- */

export function BentoProjectIdentity(_props: RegisteredWidgetProps) {
  const page = useProject();
  const project = page.project;
  const { run: runReport, isPending: reportPending } = useReportRun();

  if (project === null) {
    return (
      <BentoTile className="flex h-full min-h-0 w-full items-center justify-center p-5">
        <p className="text-sm text-muted-foreground">Resolving project…</p>
      </BentoTile>
    );
  }

  const StackIcon = stackIcon(project.stack?.id);
  const now = page.now;
  const updatedAtMs = new Date(project.updatedAt).getTime();
  const f = freshness(project.updatedAt, project.lastOpenedAt, now);
  // Map the shared recency tier onto the ring's tone vocabulary.
  const ringTier =
    f >= 0.95 ? "hero" : f >= 0.45 ? "feature" : f >= 0.2 ? "medium" : "compact";

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white/[0.04] text-muted-foreground"
        >
          <StackIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-tight">{project.name}</h1>
            {project.stack ? (
              <span className="shrink-0 rounded-full border border-border bg-white/[0.03] px-2 py-px text-[0.62rem] font-medium text-muted-foreground">
                {project.stack.label}
              </span>
            ) : null}
            {project.pinned ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 font-mono text-[0.62rem]"
                style={{ color: "var(--pinned-accent)" }}
              >
                pinned
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void page.copyPath()}
            title="Copy path"
            className="min-w-0 max-w-full truncate text-left font-mono text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            {project.path}
          </button>
        </div>
        <RecencyRing updatedAtMs={updatedAtMs} score={f} tier={ringTier} now={now} px={48} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Meta label="Created" value={absoluteDate(project.createdAt)} />
        <Meta label="Updated" value={relativeTime(project.updatedAt)} />
        <Meta
          label="Last opened"
          value={project.lastOpenedAt ? relativeTime(project.lastOpenedAt) : "—"}
        />
      </dl>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" onClick={() => page.open("editor")}>
          <Folder className="size-3.5" /> Editor
        </Button>
        <Button size="sm" variant="outline" onClick={() => page.open("terminal")}>
          <TerminalIcon className="size-3.5" /> Terminal
        </Button>
        <Button size="sm" variant="outline" onClick={() => page.open("folder")}>
          <Folder className="size-3.5" /> Folder
        </Button>
        <Button size="sm" variant="outline" disabled={page.ide.installingLabel !== null || page.ide.starting} onClick={() => page.ide.open()}>
          {page.ide.installingLabel !== null || page.ide.starting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CodeXml className="size-3.5" />
          )}
          {page.ide.installingLabel ?? (page.ide.starting ? "Starting…" : "IDE")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!project.git.isRepo || reportPending}
          title={!project.git.isRepo ? "Not a git repository" : "Open the git-snitch report"}
          onClick={() => runReport({ kind: "repo", path: page.path, force: true })}
        >
          {reportPending ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
          {reportPending ? "Generating…" : "Report"}
        </Button>
      </div>

      <div className="mt-auto flex min-h-0 flex-col gap-1.5 border-t border-border pt-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <Eyebrow>where i left off</Eyebrow>
          <span className="font-mono text-[0.62rem] text-muted-foreground/70">
            saved when you click away
          </span>
        </div>
        <Textarea
          value={page.note.draft}
          onChange={(e) => page.note.setDraft(e.target.value)}
          onBlur={() => page.note.save()}
          placeholder="What were you doing? What's next?"
          rows={2}
          className="min-h-0"
        />
      </div>
    </BentoTile>
  );
}

/* --------------------------------------------------------------- state --- */

export function BentoProjectState(_props: RegisteredWidgetProps) {
  const page = useProject();
  const project = page.project;
  const git = page.git;

  if (project === null) {
    return (
      <BentoTile className="flex h-full min-h-0 w-full items-center justify-center p-5">
        <p className="text-sm text-muted-foreground">Resolving project…</p>
      </BentoTile>
    );
  }

  const gitInfo = project.git;
  const recent = page.commitLog.data ?? [];

  return (
    <BentoTile className="flex h-full min-h-0 w-full flex-col gap-3 p-5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h2 className="b-label">state</h2>
        {gitInfo.isRepo && gitInfo.remote ? <GitActionsToolbarPart /> : null}
      </div>

      {!gitInfo.isRepo ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Not a git repository.
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 content-start gap-x-6 gap-y-3 md:grid-cols-2 md:divide-x md:divide-border">
          <div className="flex min-w-0 flex-col gap-3 md:pr-5">
            <BranchSwitcherPart />
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Remote</span>
              {gitInfo.remote ? (
                <a
                  href={gitInfo.remote.links.web}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 hover:underline"
                  style={{ color: "var(--bento-c1)" }}
                >
                  <span className="truncate">
                    {hostLabel(gitInfo.remote.host)} · {gitInfo.remote.slug}
                  </span>
                  <ExternalLinkIcon className="size-3 shrink-0" />
                </a>
              ) : (
                <span className="text-muted-foreground">none</span>
              )}
            </div>
            <GitGlyphs git={gitInfo} large />
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Dirty files</span>
              <span className="b-num text-sm">{gitInfo.dirtyCount ?? 0}</span>
            </div>
            {git.diverged ? (
              <p className="text-xs leading-relaxed" style={{ color: "var(--sev-critical)" }}>
                Diverged from upstream — a fast-forward pull isn&rsquo;t possible. Reconcile the
                branches from a terminal.
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-2.5 md:pl-5">
            <h3 className="b-label">last commit</h3>
            {gitInfo.lastCommit ? (
              <div className="flex min-w-0 flex-col gap-1">
                <p className="line-clamp-2 text-sm leading-snug" title={gitInfo.lastCommit.message}>
                  {gitInfo.lastCommit.message}
                </p>
                <p className="font-mono text-[0.66rem] text-muted-foreground">
                  {gitInfo.lastCommit.author} · {relativeTime(gitInfo.lastCommit.date)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No commits yet.</p>
            )}

            <div className="mt-auto flex min-h-0 flex-1 flex-col gap-1 border-t border-border pt-2.5">
              <h3 className="b-label">right behind it</h3>
              {page.commitLog.isPending ? (
                <p className="text-xs text-muted-foreground">Loading history…</p>
              ) : recent.length === 0 ? (
                <p className="text-xs text-muted-foreground">No earlier commits.</p>
              ) : (
                <ul className="flex min-h-0 flex-1 flex-col justify-evenly">
                  {recent.slice(0, RECENT_COMMITS).map((commit) => (
                    <li key={commit.hash} className="flex min-w-0 items-baseline gap-2 text-xs">
                      <span className="b-glyph shrink-0">{commit.hash.slice(0, 7)}</span>
                      <span className="min-w-0 flex-1 truncate" title={commit.subject}>
                        {commit.subject}
                      </span>
                      <span className="shrink-0 font-mono text-[0.62rem] text-muted-foreground">
                        {relativeTime(new Date(commit.timestamp * 1000).toISOString())}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {gitInfo.remote ? (
                <div className="flex shrink-0 flex-wrap gap-1 pt-1.5">
                  <Button size="xs" variant="outline" render={<a href={gitInfo.remote.links.issues} target="_blank" rel="noreferrer" />}>
                    Issues
                  </Button>
                  <Button size="xs" variant="outline" render={<a href={gitInfo.remote.links.pulls} target="_blank" rel="noreferrer" />}>
                    Pull requests
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </BentoTile>
  );
}
