import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

import { resolveInside } from "@workspace-welcome/api/lib/file-ops";
import { requireKnownProject } from "@workspace-welcome/api/lib/known-project";

/**
 * Inline file preview as a plain server route (same containment discipline as
 * download.ts, but no content-disposition — the browser renders it inline).
 * Size-capped so giant files are never slurped into memory.
 */

/** Previews larger than this are refused before reading (client mirrors it). */
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "mdx", "txt",
  "css", "scss", "html", "htm", "yaml", "yml", "toml", "ini", "env",
  "py", "rs", "go", "java", "kt", "rb", "php", "c", "h", "cpp", "hpp",
  "cs", "swift", "sql", "sh", "bash", "zsh", "xml", "svg", "csv", "log",
  "lock", "gitignore", "editorconfig",
]);

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

export const Route = createFileRoute("/api/files/view")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const project = params.get("project");
        const path = params.get("path");
        if (project === null || path === null) {
          return new Response("Missing project or path parameter", {
            status: 400,
          });
        }
        try {
          const root = await requireKnownProject(project);
          // resolveInside is the containment gate here — same as every
          // files.* mutation.
          const abs = await resolveInside(root, path);
          const { size } = await stat(abs);
          if (size > MAX_PREVIEW_BYTES) {
            return new Response("File is too large to preview (max 2 MB)", {
              status: 415,
            });
          }
          const ext = extname(abs).slice(1).toLowerCase();
          const imageType = IMAGE_TYPES[ext];
          if (!imageType && !TEXT_EXTENSIONS.has(ext) && ext !== "pdf") {
            return new Response("Preview not supported", { status: 415 });
          }
          const buf = await readFile(abs);
          return new Response(new Uint8Array(buf), {
            headers: {
              "content-type":
                imageType ??
                (ext === "pdf"
                  ? "application/pdf"
                  : "text/plain; charset=utf-8"),
              "content-length": String(buf.byteLength),
              "content-security-policy": "sandbox",
            },
          });
        } catch (err) {
          if ((err as { code?: string }).code === "ENOENT") {
            return new Response("Not found", { status: 404 });
          }
          throw err;
        }
      },
    },
  },
});
