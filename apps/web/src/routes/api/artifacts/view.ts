import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";

import { createFileRoute } from "@tanstack/react-router";

import { isInsideAnyDir, MEDIA_CONTENT_TYPES } from "@workspace-welcome/api/lib/artifacts";
import { resolveInside } from "@workspace-welcome/api/lib/file-ops";
import { requireKnownProject } from "@workspace-welcome/api/lib/known-project";
import { readProjectConfig } from "@workspace-welcome/api/lib/project-config";

/**
 * Inline artifact media serving (images + videos) — a plain server route
 * because the response is a binary stream. Streams rather than slurps:
 * test recordings are routinely hundreds of MB, and <video> seeking needs
 * Range support (206 + content-range), which a readFile-based response
 * can't offer cheaply.
 *
 * Only files under one of the project's configured artifact folders are
 * served — this route is deliberately NOT a second general file server
 * (that's /api/files/view); the configured folder list is what marks a file
 * as an artifact.
 */

/**
 * Single-range parsing per RFC 9110: null when the header is absent,
 * multi-range or malformed (ignore it and serve the whole file), and
 * "unsatisfiable" for a well-formed range with no overlap (416).
 */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (header === null || size === 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  const start =
    rawStart === "" ? Math.max(size - Number(rawEnd), 0) : Number(rawStart);
  // bytes=-0 and start >= size have no satisfiable bytes → 416.
  if (start >= size) return "unsatisfiable";
  const end =
    rawStart === "" || rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (end < start) return null; // invalid per spec → ignore
  return { start, end };
}

export const Route = createFileRoute("/api/artifacts/view")({
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
          const config = await readProjectConfig(root);
          if (config.artifacts.dirs.length === 0) {
            return new Response("No artifact folders configured", {
              status: 404,
            });
          }
          const abs = await resolveInside(root, path);
          const resolvedDirs = await Promise.all(
            config.artifacts.dirs.map((dir) => resolveInside(root, dir)),
          );
          if (!isInsideAnyDir(abs, resolvedDirs)) {
            return new Response("Not inside a configured artifact folder", {
              status: 403,
            });
          }
          const fileStat = await stat(abs);
          if (!fileStat.isFile()) {
            return new Response("Not a file", { status: 404 });
          }
          const contentType = MEDIA_CONTENT_TYPES[extname(abs).slice(1).toLowerCase()];
          if (contentType === undefined) {
            return new Response("Unsupported media type", { status: 415 });
          }

          const size = fileStat.size;
          const range = parseRange(request.headers.get("range"), size);
          if (range === "unsatisfiable") {
            return new Response("Range not satisfiable", {
              status: 416,
              headers: { "content-range": `bytes */${size}` },
            });
          }
          const { start, end } = range ?? { start: 0, end: size - 1 };

          const stream = createReadStream(abs, { start, end });
          // A canceled load (video seek, closed lightbox) or a mid-stream
          // error must not leave the descriptor pumping.
          stream.on("error", () => stream.destroy());
          if (!request.signal.aborted) {
            request.signal.addEventListener(
              "abort",
              () => stream.destroy(),
              { once: true },
            );
          }

          // The client cache-busts with the file's mtime as the `v` query
          // param, so a modest max-age is safe and keeps gallery scrolling
          // from re-fetching every thumbnail.
          const headers = new Headers({
            "content-type": contentType,
            "content-length": String(end - start + 1),
            "accept-ranges": "bytes",
            "cache-control": "private, max-age=3600",
            "content-security-policy": "sandbox",
          });
          if (range !== null) {
            headers.set("content-range", `bytes ${start}-${end}/${size}`);
          }
          return new Response(
            Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>,
            { status: range === null ? 200 : 206, headers },
          );
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
