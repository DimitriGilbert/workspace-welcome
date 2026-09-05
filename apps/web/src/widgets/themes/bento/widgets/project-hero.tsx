/**
 * Bento's project hero pair (master plan §5 T3-bento): the design's
 * identity + state tiles (`components/designs/bento/project-page.tsx`
 * overview band, spans 3 + 5 of 12) ported onto the widget system.
 *
 * - `bento-project-identity` — name/stack/pinned over `useProject()`, the
 *   copy-path affordance, the created/updated/last-opened register, the
 *   editor/terminal/folder/IDE open row (the provider's IDE choreography),
 *   a force-regenerate report button, and the "where i left off" note via
 *   the NoteEditor part.
 * - `bento-project-state` — the owner-mandated GROUPED state tile: git
 *   controls (GitActionsToolbar + BranchSwitcher parts) and the last commit
 *   with the history right behind it, together in one tile, exactly the
 *   design's `md:grid-cols-2` split.
 *
 * Everything interactive rides the provider stack (§3.4) — the identity
 * widget never touches tRPC, and per-entry report state comes from the
 * report context, never a local copy. The design's recency ring had no
 * canonical metric on the theme import surface, so the hero's state pixel
 * is the system's ProjectLed part instead (recorded in the wave report).
 */
import { type ReactNode } from "react";
import {
  CodeXml,
  ExternalLink,
  FileText,
  Folder,
  Loader2,
  Terminal,
} from "lucide-react";

import type { Project } from "@workspace-welcome/api/lib/types";
import { Button } from "@workspace-welcome/ui/components/button";
import { Chip } from "@workspace-welcome/ui/components/chip";
import { GitGlyphs } from "@workspace-welcome/ui/components/git-glyphs";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { absoluteDate, relativeTime } from "@/lib/format";

import { BranchSwitcherPart, GitActionsToolbarPart, NoteEditorPart, ProjectLedPart } from "@/widgets/parts";
import { useProject } from "@/widgets/contexts/project-context";
import { useReport } from "@/widgets/contexts/report-context";
import type { RegisteredWidgetProps } from "@/widgets/registry";
import { WidgetShell } from "@/widgets/runtime/widget-shell";

/** The "right behind it" window — the provider's cached log, newest first. */
const RECENT_COMMITS = 4;

/* ------------------------------------------------------------ helpers --- */

function HeroFill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 w-full min-w-0 flex-col", className)}>
      {children}
    </div>
  );
}

function HeroQuiet({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** The design's mono-caps eyebrow register (`b-label`). */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </span>
  );
}

/** One label/value row of the design's meta register. */
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <Eyebrow>{label}</Eyebrow>
      <dd className="mt-0.5 truncate font-mono text-[0.72rem] text-foreground/90" title={value}>
        {value}
      </dd>
    </div>
  );
}

function useProjectOrQuiet(): Project | null {
  const project = useProject().project;
  return project;
}

/* ---------------------------------------------------------- identity --- */

function IdentityBody({ project }: { project: Project }) {
  const page = useProject();
  const report = useReport();
  const ideInstalling = page.ide.installingLabel !== null;
  return (
    <HeroFill className="gap-4 px-5 py-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ProjectLedPart project={project} />
            <span className="truncate text-lg font-semibold tracking-tight" title={project.name}>
              {project.name}
            </span>
            {project.stack ? (
              <Chip tone="neutral" title={`${project.stack.label} stack`}>
                {project.stack.label}
              </Chip>
            ) : null}
            {project.pinned ? <Chip tone="accent">pinned</Chip> : null}
          </div>
          <button
            type="button"
            onClick={() => void page.copyPath()}
            title="Copy path"
            className="min-w-0 max-w-full truncate pt-0.5 text-left font-mono text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            {project.path}
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Meta label="Created" value={absoluteDate(project.createdAt)} />
        <Meta label="Updated" value={relativeTime(project.updatedAt)} />
        <Meta
          label="Last opened"
          value={project.lastOpenedAt ? relativeTime(project.lastOpenedAt) : "—"}
        />
      </dl>

      <div className="flex flex-wrap items-center gap-1.5" data-slot="bento-identity-actions">
        <Button size="sm" onClick={() => page.open("editor")}>
          <Folder className="size-3.5" aria-hidden /> Editor
        </Button>
        <Button size="sm" variant="outline" onClick={() => page.open("terminal")}>
          <Terminal className="size-3.5" aria-hidden /> Terminal
        </Button>
        <Button size="sm" variant="outline" onClick={() => page.open("folder")}>
          <ExternalLink className="size-3.5" aria-hidden /> Folder
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={ideInstalling || page.ide.starting}
          onClick={() => page.ide.open()}
        >
          {ideInstalling || page.ide.starting ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <CodeXml className="size-3.5" aria-hidden />
          )}
          {ideInstalling
            ? page.ide.installingLabel
            : page.ide.starting
              ? "Starting…"
              : "IDE"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!project.git.isRepo || report.generating}
          title={!project.git.isRepo ? "Not a git repository" : "Regenerate the git-snitch report"}
          onClick={() => report.generate({ force: true })}
        >
          {report.generating ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <FileText className="size-3.5" aria-hidden />
          )}
          {report.generating ? "Generating…" : "Report"}
        </Button>
      </div>

      <div className="mt-auto flex min-h-0 flex-col gap-1 border-t border-border pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <Eyebrow>where i left off</Eyebrow>
          <span className="font-mono text-[0.62rem] text-muted-foreground/70">
            saved when you click away
          </span>
        </div>
        <NoteEditorPart rows={2} placeholder="What were you doing? What's next?" />
      </div>
    </HeroFill>
  );
}

export function BentoProjectIdentity({ size }: RegisteredWidgetProps) {
  const project = useProjectOrQuiet();

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "3x4":
          project === null ? (
            <HeroQuiet>
              {project === null
                ? "Project not in the current scan — it may have been moved, hidden or deleted."
                : null}
            </HeroQuiet>
          ) : (
            <IdentityBody project={project} />
          ),
        "1x1":
          project === null ? (
            <HeroQuiet>Not in scan</HeroQuiet>
          ) : (
            <HeroFill className="items-center gap-1.5 px-2.5 py-2">
              <ProjectLedPart project={project} />
              <span className="line-clamp-2 text-[11px] leading-tight font-semibold tracking-tight">
                {project.name}
              </span>
            </HeroFill>
          ),
      }}
    />
  );
}

/* ------------------------------------------------------------- state --- */

function LastCommitBlock({ project }: { project: Project }) {
  const page = useProject();
  const commit = project.git.lastCommit;
  const recent = page.commitLog.data ?? [];
  return (
    <div className="flex min-h-0 flex-col gap-2.5">
      <Eyebrow>last commit</Eyebrow>
      {commit ? (
        <div className="flex min-w-0 flex-col gap-1">
          <p className="line-clamp-2 text-sm leading-snug" title={commit.message}>
            {commit.message}
          </p>
          <p className="font-mono text-[0.66rem] text-muted-foreground">
            {commit.author} · {relativeTime(commit.date)}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No commits yet.</p>
      )}

      <div className="mt-auto flex min-h-0 flex-1 flex-col gap-1 border-t border-border pt-2.5">
        <Eyebrow>right behind it</Eyebrow>
        {page.commitLog.isPending ? (
          <p className="text-xs text-muted-foreground">Loading history…</p>
        ) : recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">No earlier commits.</p>
        ) : (
          <ul className="flex min-h-0 flex-1 list-none flex-col justify-evenly overflow-hidden p-0">
            {recent.slice(0, RECENT_COMMITS).map((entry) => (
              <li key={entry.hash} className="flex min-w-0 items-baseline gap-2 text-xs">
                <span className="shrink-0 font-mono text-[0.66rem]" style={{ color: "var(--chart-1)" }}>
                  {entry.hash.slice(0, 7)}
                </span>
                <span className="min-w-0 flex-1 truncate" title={entry.subject}>
                  {entry.subject}
                </span>
                <span className="shrink-0 font-mono text-[0.62rem] text-muted-foreground">
                  {relativeTime(new Date(entry.timestamp * 1000).toISOString())}
                </span>
              </li>
            ))}
          </ul>
        )}
        {project.git.remote ? (
          <div className="flex shrink-0 flex-wrap gap-1 pt-1.5">
            <Button size="xs" variant="outline" render={<a href={project.git.remote.links.issues} target="_blank" rel="noreferrer" />}>
              Issues
            </Button>
            <Button size="xs" variant="outline" render={<a href={project.git.remote.links.pulls} target="_blank" rel="noreferrer" />}>
              Pull requests
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StateBody({ project }: { project: Project }) {
  const page = useProject();
  const git = project.git;
  return (
    <HeroFill className="gap-3 px-5 py-5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <Eyebrow>state</Eyebrow>
        {git.isRepo && git.remote ? <GitActionsToolbarPart /> : null}
      </div>

      {!git.isRepo ? (
        <HeroQuiet>Not a git repository.</HeroQuiet>
      ) : (
        <div className="grid min-h-0 flex-1 content-start gap-x-6 gap-y-3 md:grid-cols-2 md:divide-x md:divide-border">
          <div className="flex min-w-0 flex-col gap-3 md:pr-5">
            <BranchSwitcherPart />
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Remote</span>
              {git.remote ? (
                <a
                  href={git.remote.links.web}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 hover:underline"
                  style={{ color: "var(--chart-1)" }}
                >
                  <span className="truncate">
                    {git.remote.host}
                    {git.remote.slug ? ` · ${git.remote.slug}` : ""}
                  </span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
              ) : (
                <span className="text-muted-foreground">none</span>
              )}
            </div>
            <GitGlyphs
              isRepo
              ahead={git.ahead ?? 0}
              behind={git.behind ?? 0}
              dirtyCount={git.dirtyCount ?? 0}
              large
            />
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Dirty files</span>
              <span className="font-mono text-sm tabular-nums">{git.dirtyCount ?? 0}</span>
            </div>
            {page.git.diverged ? (
              <p className="text-xs leading-relaxed" style={{ color: "var(--sev-critical)" }}>
                Diverged from upstream — a fast-forward pull isn&rsquo;t possible.
                Reconcile the branches from a terminal.
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col md:pl-5">
            <LastCommitBlock project={project} />
          </div>
        </div>
      )}
    </HeroFill>
  );
}

export function BentoProjectState({ size }: RegisteredWidgetProps) {
  const project = useProjectOrQuiet();

  return (
    <WidgetShell
      size={{ cols: size.cols, rows: size.rows }}
      className="h-full w-full"
      sizes={{
        "5x4":
          project === null ? (
            <HeroQuiet>Project not in the current scan.</HeroQuiet>
          ) : (
            <StateBody project={project} />
          ),
        "2x1":
          project === null ? (
            <HeroQuiet>Not in scan</HeroQuiet>
          ) : (
            <HeroFill className="justify-center gap-1.5 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <ProjectLedPart project={project} />
                <span className="truncate font-mono text-xs">
                  {project.git.branch ?? "detached"}
                </span>
              </div>
              <GitGlyphs
                isRepo={project.git.isRepo}
                ahead={project.git.ahead ?? 0}
                behind={project.git.behind ?? 0}
                dirtyCount={project.git.dirtyCount ?? 0}
              />
            </HeroFill>
          ),
      }}
    />
  );
}
