import { useNavigate } from "@tanstack/react-router";

/**
 * Navigate to a project's page inside the Meadow concept. Project paths are
 * absolute, so the leading "/" is stripped and the rest rides the splat:
 * /home/didi/x → /designs/meadow/project/home/didi/x
 * (Meadow's own helper — deliberately not the main-app useOpenProject.)
 */
export function useOpenMeadowProject() {
  const navigate = useNavigate();
  return (path: string) => {
    void navigate({
      to: "/designs/meadow/project/$",
      params: { _splat: path.replace(/^\/+/, "") },
    });
  };
}
