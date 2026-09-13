import { ArrowDownToLine, Check, Code, Copy, Eye, WrapText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import type { BundledLanguage } from "shiki";

import { Button } from "@workspace-welcome/ui/components/button";
import { ScrollArea } from "@workspace-welcome/ui/components/scroll-area";
import { cn } from "@workspace-welcome/ui/lib/utils";

import { formatBytes } from "@/lib/format";

/**
 * Inline file viewer pane: single-clicking a tree row shows the file here,
 * next to the tree. The kind is derived client-side from the extension, but
 * the server route re-checks type and size — it is the authority, this is
 * just presentation.
 *
 * HTML and markdown files open on a live preview (a sandboxed iframe for
 * HTML, the app's one md renderer for markdown) with a header toggle to the
 * code view; code renders in the ScrollArea register with Shiki syntax
 * highlighting (every bundled grammar, loaded lazily per language) over a
 * plain-text fallback. All panes scroll through the ui ScrollArea — the
 * browser's scroll surfaces are one component.
 */

/** Mirrors the server's cap in view.ts so oversized text is never fetched. */
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico",
]);

const HTML_EXTENSIONS = new Set(["html", "htm"]);

const MARKDOWN_EXTENSIONS = new Set(["md"]);

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

/**
 * Fetches a file's text on mount / URL change. Shared by the code view and
 * the previews — mounted only while a file is selected (the viewer's
 * laziness gate).
 */
function useTextContent(url: string): {
  text: string | null;
  error: string | null;
} {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return { text, error };
}

// --- Shiki (syntax highlighting) -------------------------------------------------

/**
 * Shiki loads lazily: the module and each language's grammar are separate
 * async chunks, so nothing is paid until a code view actually highlights —
 * and every bundled grammar (the full VS Code set) is reachable. The
 * promise is cached so the pane never re-pays the module load.
 */
let shikiModule: Promise<typeof import("shiki")> | null = null;
function loadShiki(): Promise<typeof import("shiki")> {
  shikiModule ??= import("shiki");
  return shikiModule;
}

/**
 * Highlight `code` for one file, or null while unresolved — the caller
 * renders the plain-text register until then. The extension resolves
 * against Shiki's bundled ids AND aliases (ts, py, rb, sh…), falling back
 * to plain text for anything unknown. Both palettes ship as CSS variables
 * (`defaultColor: false`); index.css picks the palette off the dark class.
 */
function useHighlightedHtml(code: string, name: string): string | null {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (code.length === 0) return;
    let cancelled = false;
    setHtml(null);
    loadShiki()
      .then((shiki) => {
        const ext = extensionOf(name);
        const lang = (
          ext in shiki.bundledLanguages ? ext : "text"
        ) as BundledLanguage;
        return shiki.codeToHtml(code, {
          lang,
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
        });
      })
      .then((out) => {
        if (!cancelled) setHtml(out);
      })
      .catch(() => {
        // Highlighting is decoration — the plain register stays.
      });
    return () => {
      cancelled = true;
    };
  }, [code, name]);

  return html;
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
      : HTML_EXTENSIONS.has(ext)
        ? ("html" as const)
        : MARKDOWN_EXTENSIONS.has(ext)
          ? ("md" as const)
          : TEXT_EXTENSIONS.has(ext)
            ? ("text" as const)
            : ("other" as const);

  // Previewable files (HTML, markdown) open on the preview; the header
  // toggle flips to source.
  const previewable = kind === "html" || kind === "md";
  const [previewMode, setPreviewMode] = useState<"preview" | "code">("preview");
  useEffect(() => {
    setPreviewMode("preview");
  }, [path]);

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

  const viewUrl = `/api/files/view?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`;
  const downloadUrl = `/api/files/download?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`;
  // The code register is the text view — and the previewable files' code mode.
  const showsCode = kind === "text" || (previewable && previewMode === "code");

  // min-h-0 on the root: without it the column's auto min-height overflows
  // the fixed-height split pane instead of letting the content scroll.
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-xs font-medium">{name}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {path} — {formatBytes(size)}
        </span>
        {previewable ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              setPreviewMode((m) => (m === "preview" ? "code" : "preview"))
            }
            aria-pressed={previewMode === "code"}
            title={previewMode === "preview" ? "Show source code" : "Show preview"}
            className={cn(previewMode === "code" && "bg-accent text-accent-foreground")}
          >
            {previewMode === "preview" ? (
              <Code className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </Button>
        ) : null}
        {showsCode ? (
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
            src={viewUrl}
            alt={name}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      ) : null}
      {kind === "pdf" ? (
        <iframe
          src={viewUrl}
          title={name}
          className="min-h-[60vh] w-full flex-1 bg-background"
        />
      ) : null}
      {kind === "html" ? (
        size > MAX_PREVIEW_BYTES ? (
          <TooLarge downloadUrl={downloadUrl} />
        ) : previewMode === "preview" ? (
          <HtmlPreview url={viewUrl} name={name} />
        ) : (
          <TextPreview url={viewUrl} name={name} wrap={wrap} />
        )
      ) : null}
      {kind === "md" ? (
        size > MAX_PREVIEW_BYTES ? (
          <TooLarge downloadUrl={downloadUrl} />
        ) : previewMode === "preview" ? (
          <MdPreview url={viewUrl} />
        ) : (
          <TextPreview url={viewUrl} name={name} wrap={wrap} />
        )
      ) : null}
      {kind === "text" ? (
        size > MAX_PREVIEW_BYTES ? (
          <TooLarge downloadUrl={downloadUrl} />
        ) : (
          <TextPreview url={viewUrl} name={name} wrap={wrap} />
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

/**
 * The HTML preview: the fetched source rendered as its own document in a
 * sandboxed iframe. `allow-scripts` (without `allow-same-origin`) gives a
 * live preview while the frame stays an opaque origin — the page's scripts
 * run, but they cannot reach this app's storage, cookies, or DOM.
 */
function HtmlPreview({ url, name }: { url: string; name: string }) {
  const { text, error } = useTextContent(url);

  if (error !== null) {
    return <p className="py-8 text-center text-xs text-muted-foreground">{error}</p>;
  }
  if (text === null) {
    return <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>;
  }
  return (
    <iframe
      sandbox="allow-scripts"
      srcDoc={text}
      title={`Preview of ${name}`}
      className="min-h-0 w-full flex-1 rounded-none border border-border bg-white"
    />
  );
}

/**
 * The markdown preview — the app's one md renderer (Streamdown, the
 * ideation panel's), sanitized, inside the browser's scroll register.
 */
function MdPreview({ url }: { url: string }) {
  const { text, error } = useTextContent(url);

  if (error !== null) {
    return <p className="py-8 text-center text-xs text-muted-foreground">{error}</p>;
  }
  if (text === null) {
    return <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>;
  }
  return (
    <ScrollArea className="min-h-0 flex-1 rounded-none border border-border">
      <div className="min-w-0 px-4 py-3 text-xs leading-relaxed">
        <Streamdown className="min-w-0">{text}</Streamdown>
      </div>
    </ScrollArea>
  );
}

/**
 * The code register: Shiki's highlighted markup when it lands, plain text
 * before (and forever, if highlighting can't run). ui ScrollArea owns the
 * scrolling on both axes — wrap off means long lines scroll, never reflow.
 */
function TextPreview({
  url,
  name,
  wrap,
}: {
  url: string;
  name: string;
  wrap: boolean;
}) {
  const { text, error } = useTextContent(url);
  const highlighted = useHighlightedHtml(text ?? "", name);
  const [copied, setCopied] = useState(false);

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
      <ScrollArea scrollbars="both" className="min-h-0 flex-1 rounded-none bg-muted/40">
        {/* wrap on: code fills the pane width and reflows; wrap off: it is
            as wide as its longest line so the viewport scrolls in x. The
            shared padding/font register styles both the highlighted and the
            plain fallback identically. */}
        <div className="p-3 font-mono text-xs">
          {highlighted !== null ? (
            <div
              className={cn(
                "[&_.shiki]:m-0",
                wrap
                  ? "[&_.shiki]:w-full [&_.shiki]:whitespace-pre-wrap"
                  : "[&_.shiki]:w-max [&_.shiki]:min-w-full [&_.shiki]:whitespace-pre",
              )}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <pre
              className={cn(
                "m-0 block",
                wrap ? "w-full whitespace-pre-wrap" : "w-max min-w-full whitespace-pre",
              )}
            >
              {text}
            </pre>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
