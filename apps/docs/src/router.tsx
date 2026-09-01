import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: () => (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="font-mono text-[0.7rem] text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">Nothing here</h1>
        <a href="/" className="mt-4 inline-block font-mono text-[0.7rem] text-muted-foreground underline underline-offset-2 hover:text-foreground">
          home
        </a>
      </div>
    ),
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
