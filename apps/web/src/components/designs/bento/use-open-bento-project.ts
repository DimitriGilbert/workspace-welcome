import { useNavigate } from "@tanstack/react-router";

/**
 * Navigate to a project's page in the Bento concept. Project paths are
 * absolute, so the leading "/" is stripped and the rest rides the splat:
 * /home/didi/x → /designs/bento/project/home/didi/x. Concept-local on
 * purpose — the main dashboard's helper targets /projects/$.
 */
export function useOpenBentoProject() {
  const navigate = useNavigate();
  return (path: string) => {
    void navigate({
      to: "/designs/bento/project/$",
      params: { _splat: path.replace(/^\/+/, "") },
    });
  };
}
