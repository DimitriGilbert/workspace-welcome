import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

import { resolveInside } from "@workspace-welcome/api/lib/file-ops";
import { requireKnownProject } from "@workspace-welcome/api/lib/known-project";

/**
 * File download as a plain server route (not tRPC): the response is a binary
 * stream with `content-disposition: attachment`, which the browser handles
 * directly — serve-prod.mjs pumps Response bodies, so this works in prod too.
 */
export const Route = createFileRoute("/api/files/download")({
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
          const buf = await readFile(abs);
          // Header-injection guard: quotes, CR/LF and path separators are
          // stripped so nothing can ride along in content-disposition.
          const safeName =
            basename(abs).replace(/["'\r\n/\\]/g, "") || "download";
          return new Response(new Uint8Array(buf), {
            headers: {
              "content-type": "application/octet-stream",
              "content-disposition": `attachment; filename="${safeName}"`,
              "content-length": String(buf.byteLength),
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
