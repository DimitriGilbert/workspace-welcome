import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 37420,
  },
  resolve: {
    tsconfigPaths: true,
  },
  // The scaffolder ships native formatter bindings (oxfmt) that cannot be
  // bundled; keep it as a runtime import resolved from node_modules.
  ssr: {
    external: ["create-better-t-stack"],
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
