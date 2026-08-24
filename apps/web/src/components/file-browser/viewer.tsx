import { ArrowDownToLine, Check, Copy, WrapText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@workspace-welcome/ui/components/button";
import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * Inline file viewer pane: single-clicking a tree row shows the file here,
 * next to the tree. The kind is derived client-side from the extension, but
 * the server route re-checks type and size — it is the authority, this is
 * just presentation.
 */

/** Mirrors the server's cap in view.ts so oversized text is never fetched. */
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico",
]);

const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "mdx", "txt",
  "css", "scss", "html", "htm", "yaml", "yml", "toml", "ini", "env",
  "py", "rs", "go", "java", "kt", "rb", "php", "c", "h", "cpp", "hpp",
  "cs", "swift", "sql", "sh", "bash", "zsh", "xml", "csv", "log", "lock",
  "gitignore", "editorconfig",
]);

const WRAP_KEY = "file-browser.word-wrap";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileViewerProps {
  project: string;
  /** Relative path of the file, "/"-joined from the project root. */
  path: string;
  name: string;
  size: number;
}

export function FileViewer({ project, path, name, size }: FileViewerProps) {
  const ext = extensionOf(name);
  const kind = IMAGE_EXTENSIONS.has(ext)
    ? ("image" as const)
    : ext === "pdf"
      ? ("pdf" as const)
      : TEXT_EXTENSIONS.has(ext)
        ? ("text" as const)
        : ("other" as const);

  const [wrap, setWrap] = useState(true);
  useEffect(() => {
    // Stored as "0" when off; anything else (or absent) defaults to wrap on.
    try {
      if (window.localStorage.getItem(WRAP_KEY) === "0") setWrap(false);
    } catch {
      // Private mode etc. — the default is fine.
    }
  }, []);
  const toggleWrap = () => {
    setWrap((w) => {
      try {
        window.localStorage.setItem(WRAP_KEY, w ? "0" : "1");
      } catch {
        // Persisting is best-effort; the toggle itself still works.
      }
      return !w;
    });
  };

  const downloadUrl = `/api/files/download?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`;

  // min-h-0 on the root: without it the column's auto min-height overflows
  // the fixed-height split pane instead of letting the content scroll.
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-xs font-medium">{name}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {path} — {formatBytes(size)}
        </span>
        {kind === "text" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleWrap}
            aria-pressed={wrap}
            title={wrap ? "Disable word wrap" : "Enable word wrap"}
            className={cn(wrap && "bg-accent text-accent-foreground")}
          >
            <WrapText className="size-3.5" />
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="icon-sm"
          render={<a href={downloadUrl} download />}
          title={`Download ${name}`}
        >
          <ArrowDownToLine className="size-3.5" />
        </Button>
      </div>
      {kind === "image" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-none border border-border p-3">
          <img
            src={`/api/files/view?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`}
            alt={name}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      ) : null}
      {kind === "pdf" ? (
        <iframe
          src={`/api/files/view?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`}
          title={name}
          className="min-h-[60vh] w-full flex-1 bg-background"
        />
      ) : null}
      {kind === "text" ? (
        size > MAX_PREVIEW_BYTES ? (
          <TooLarge downloadUrl={downloadUrl} />
        ) : (
          <TextPreview
            url={`/api/files/view?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`}
            wrap={wrap}
          />
        )
      ) : null}
      {kind === "other" ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          No inline preview for this file type.
        </p>
      ) : null}
    </div>
  );
}

function TooLarge({ downloadUrl }: { downloadUrl: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-xs text-muted-foreground">
      <p>Too large to preview (max 2 MB) — use Download instead.</p>
      <Button variant="outline" size="sm" render={<a href={downloadUrl} download />}>
        Download
      </Button>
    </div>
  );
}

/** Fetches the text on mount / file change — mounted only when selected (lazy). */
function TextPreview({ url, wrap }: { url: string; wrap: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        return res.text();
      })
      .then((body) => {
        if (!cancelled) setText(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Couldn't load the file.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copy = async () => {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  if (error !== null) {
    return <p className="py-8 text-center text-xs text-muted-foreground">{error}</p>;
  }
  if (text === null) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
    );
  }
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Button
        variant="ghost"
        size="sm"
        onClick={copy}
        className="absolute top-1 right-1"
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
      {/* wrap off + overflow-x-auto: long lines scroll, never reflow;
          block w-full so wrap-on fills the pane with no dead column */}
      <pre
        className={cn(
          "block w-full min-h-0 flex-1 overflow-auto rounded-none bg-muted/40 p-3 font-mono text-xs",
          wrap ? "whitespace-pre-wrap" : "whitespace-pre",
        )}
      >
        {text}
      </pre>
    </div>
  );
}
