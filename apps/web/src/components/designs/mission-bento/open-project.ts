import { useNavigate } from "@tanstack/react-router";

/**
 * Navigate to a project page inside this concept. Same splat convention as
 * the shared helper — absolute paths lose their leading "/" — but pointed at
 * the mission-bento project route. `ideationNew` deep-links into a fresh
 * ideation session (?ideation=new), the create-toast handoff.
 */
export function useMbOpenProject() {
  const navigate = useNavigate();
  return (path: string, ideationNew = false) => {
    if (ideationNew) {
      void navigate({
        to: "/designs/mission-bento/project/$",
        params: { _splat: path.replace(/^\/+/, "") },
        search: { ideation: "new" },
      });
      return;
    }
    void navigate({
      to: "/designs/mission-bento/project/$",
      params: { _splat: path.replace(/^\/+/, "") },
    });
  };
}
