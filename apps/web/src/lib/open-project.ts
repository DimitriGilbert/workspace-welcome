import { useNavigate } from "@tanstack/react-router";

/**
 * Navigate to a project's dedicated page. Project paths are absolute, so the
 * leading "/" is stripped and the rest rides the splat route:
 * /home/didi/x → /projects/home/didi/x
 */
export function useOpenProject() {
  const navigate = useNavigate();
  return (path: string) => {
    navigate({
      to: "/projects/$",
      params: { _splat: path.replace(/^\/+/, "") },
    });
  };
}
