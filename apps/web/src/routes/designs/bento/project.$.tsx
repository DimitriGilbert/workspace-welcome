import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, MotionConfig } from "motion/react";
import { z } from "zod";

import "@/components/designs/bento/bento.css";
import { BentoProjectPage } from "@/components/designs/bento/project-page";

/**
 * Search params: `?ideation=new` is the create-success toast's deep link
 * into a fresh ideation session. Only "new" is meaningful — anything else
 * degrades to absent (the catch) instead of erroring the whole route on a
 * typo'd or foreign value.
 */
const projectSearchSchema = z.object({
  ideation: z.literal("new").optional().catch(undefined),
});

export const Route = createFileRoute("/designs/bento/project/$")({
  validateSearch: projectSearchSchema,
  component: BentoProjectRoute,
});

/**
 * The Bento concept's project page. The URL carries the absolute project
 * path as a splat — deep-linkable, back-button friendly. Wrapped in the
 * concept's glazed root so the cool tokens and tile chrome apply.
 */
function BentoProjectRoute() {
  const { _splat } = Route.useParams();
  const path = `/${_splat ?? ""}`;
  const ideationNew = Route.useSearch().ideation === "new";
  const navigate = useNavigate();

  const consumeIdeationFlag = useCallback(() => {
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, ideation: undefined }),
      replace: true,
    });
  }, [navigate]);

  return (
    <div className="bento-root">
      <MotionConfig reducedMotion="user" transition={{ duration: 0.28, ease: [0.2, 0.9, 0.3, 1] }}>
        {/* The subtle entrance: the page settles in once, never per render. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1] }}
        >
          <BentoProjectPage
            path={path}
            ideationNew={ideationNew}
            onConsumeIdeationFlag={consumeIdeationFlag}
          />
        </motion.div>
      </MotionConfig>
    </div>
  );
}
