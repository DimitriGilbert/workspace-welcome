// Production launcher for the TanStack Start SSR build.
// apps/web/dist/server/server.js exports a { fetch } handler but does not bind
// a port itself. This wraps it in a plain Node HTTP server so the prod build
// can run standalone (e.g. under systemd).
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "dist");

const { default: entry } = await import("./dist/server/server.js");
const fetchHandler = entry.fetch;

if (typeof fetchHandler !== "function") {
  console.error("[workspace-welcome] server.js did not export a fetch handler");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 37420);
const host = process.env.HOST ?? "127.0.0.1";

// Serve static client assets (js/css/images) from dist/client.
const clientDir = join(root, "client");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function tryStaticAsset(urlPath) {
  // Resolve relative to clientDir; reject path traversal.
  const decoded = decodeURIComponent(urlPath);
  if (decoded.includes("..")) return null;
  const filePath = join(clientDir, decoded);
  if (!filePath.startsWith(clientDir)) return null;
  try {
    const data = await readFile(filePath);
    const ext = filePath.slice(filePath.lastIndexOf("."));
    return { data, mime: MIME[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Static assets live under /assets/* (hashed bundles) and a few roots.
    const isAsset =
      url.pathname.startsWith("/assets/") ||
      /\.(?:js|mjs|css|svg|png|jpe?g|gif|webp|ico|woff2?|txt|json)$/.test(
        url.pathname,
      );

    if (isAsset) {
      const asset = await tryStaticAsset(url.pathname);
      if (asset) {
        res.writeHead(200, { "content-type": asset.mime });
        res.end(asset.data);
        return;
      }
    }

    // Everything else (pages, tRPC, API routes) goes to the app's fetch handler.
    const init = {
      method: req.method,
      headers: req.headers,
      // GET/HEAD have no body; for others stream the body through.
      body:
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : req,
      // @ts-ignore - duplex is required when streaming a body
      duplex: "half",
    };

    const response = await fetchHandler(new Request(`http://${host}:${port}${req.url}`, init));

    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      const reader = response.body.getReader();
      // @ts-ignore
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (err) {
    console.error("[workspace-welcome] request error:", err);
    if (!res.headersSent) res.writeHead(500);
    res.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`[workspace-welcome] prod server listening on http://${host}:${port}`);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`[workspace-welcome] received ${sig}, shutting down`);
    server.close(() => process.exit(0));
  });
}
