import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  server: {
    // port-book: workspace-welcome / docs
    port: 8005,
    host: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        failOnError: true,
      },
      pages: [
        {
          path: "/404",
          prerender: {
            enabled: true,
            outputPath: "/404.html",
          },
        },
      ],
    }),
    viteReact(),
  ],
});
