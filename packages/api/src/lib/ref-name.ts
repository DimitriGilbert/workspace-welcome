import { z } from "zod";

/**
 * A branch name safe to hand to `git fetch origin <branch>` /
 * `git switch <branch>` / `git clone --branch <branch>` as a single argv
 * element. Mirrors git's own refname rules for the cases that matter here:
 * no option-looking names (leading `-`), no whitespace/control characters,
 * no refspec/glob syntax (`~ ^ : ? * [ \` `), no `..` range syntax, and no
 * trailing `.` / `/` / `.lock`. Applied on the fetchBranch, switchBranch, and
 * clone inputs so mistakes surface as validation errors, not opaque git
 * failures. Node-free: the clone form's browser-safe schema reuses it.
 */
export const branchNameSchema = z
  .string()
  .min(1, "Branch name is required")
  .max(200, "Branch name must be 200 characters or fewer")
  .refine(
    (name) => !name.startsWith("-"),
    "Branch name cannot start with a dash",
  )
  .refine(
    (name) => !/[\s\u0000-\u001f\u007f]/.test(name),
    "Branch name cannot contain whitespace or control characters",
  )
  .refine(
    (name) => !/[~^:?*\\[\`]/.test(name) && !name.includes(".."),
    "Branch name cannot contain refspec characters or '..'",
  )
  .refine(
    (name) =>
      !name.endsWith(".") && !name.endsWith("/") && !name.endsWith(".lock"),
    "Branch name cannot end with '.', '/' or '.lock'",
  );
