import { useNavigate } from "@tanstack/react-router";

/**
 * Navigate to a project page inside THIS design. Project paths are absolute,
 * so the leading "/" is stripped and the rest rides the splat route:
 * /home/didi/x → /designs/mission-control/project/home/didi/x. Deliberately
 * separate from @/lib/open-project, which targets the production /projects/$
 * page — the design must stay self-contained while both exist.
 */
export function useOpenDesignProject() {
  const navigate = useNavigate();
  return (path: string) => {
    void navigate({
      to: "/designs/mission-control/project/$",
      params: { _splat: path.replace(/^\/+/, "") },
    });
  };
}

/** Route-agnostic link target for the same navigation, for <Link> elements. */
export function designProjectHref(path: string): string {
  return `/designs/mission-control/project/${path.replace(/^\/+/, "")}`;
}
