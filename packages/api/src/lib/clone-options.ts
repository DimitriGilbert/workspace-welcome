import { z } from "zod";

import { deriveRepoName, matchRemoteUrl } from "./remote-grammar";
import { branchNameSchema } from "./ref-name";

/**
 * The clone-project option contract — the single source of truth the
 * clone-from-git tab of the create-project form is generated from, mirroring
 * ./scaffold-options: node-free so the web client imports it directly, and
 * the same module the server's clone router validates against. The directory
 * name and branch rules deliberately mirror their scaffold/git counterparts
 * (plain directory name; git refname safety) so a clone lands on disk exactly
 * as tracked, scanned git repos are shaped.
 */

export const cloneUrlSchema = z
  .string()
  .trim()
  .min(1, "Repository URL is required")
  .max(400, "Repository URL must be 400 characters or fewer")
  .refine(
    (url) => !url.startsWith("-"),
    "Repository URL cannot start with a dash",
  )
  .refine(
    (url) => !url.includes("::"),
    "Repository URL cannot contain '::'",
  )
  .refine(
    (url) => matchRemoteUrl(url) !== null,
    "Enter a git URL — https://host/owner/repo or git@host:owner/repo",
  );

export const cloneDirectoryNameSchema = z
  .string()
  .trim()
  .min(1, "Directory name is required")
  .max(100, "Directory name must be 100 characters or fewer")
  .refine(
    (name) => !/[/\u0000-\u001f]/.test(name) && name !== "." && name !== "..",
    "Directory name must be a plain directory name",
  )
  .refine(
    (name) => !name.startsWith(".") && !name.startsWith("-"),
    "Directory name cannot start with a dot or a dash",
  )
  .refine(
    (name) => !/[<>:"|?*]/.test(name),
    "Directory name cannot contain any of < > : \" | ? *",
  )
  .refine(
    (name) => name.toLowerCase() !== "node_modules",
    "Directory name is reserved",
  );

export const cloneInputSchema = z
  .object({
    url: cloneUrlSchema,
    root: z.string().startsWith("/"),
    directoryName: cloneDirectoryNameSchema,
    /**
     * Free-text branch, validated through the shared ref-name rules only when
     * non-empty — "" (the form's resting value) means "the remote's default
     * branch" and normalizes to undefined on submit.
     */
    branch: z.string().trim().max(200).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.branch === undefined || input.branch === "") return;
    const check = branchNameSchema.safeParse(input.branch);
    if (!check.success) {
      ctx.addIssue({
        code: "custom",
        path: ["branch"],
        message:
          check.error.issues[0]?.message ?? "Branch name is not a valid ref",
      });
    }
  });

export type CloneInput = z.infer<typeof cloneInputSchema>;

/** The form's resting values; the caller seeds `root` from its registered roots. */
export const cloneDefaults = {
  url: "",
  directoryName: "",
  branch: "",
} as const;

/**
 * Reconcile form values into what `clone.start` accepts: an empty branch
 * becomes undefined (the remote's default) rather than riding along as "".
 */
export function normalizeCloneInput(input: CloneInput): CloneInput {
  const branch = input.branch?.trim();
  return {
    ...input,
    branch: branch === "" ? undefined : branch,
  };
}

/**
 * The `git clone` invocation equivalent to this form state — the live preview
 * under the form, the frozen command in the job view, and the server's
 * reproducibleCommand all render through this one builder, so they can never
 * disagree. Empty url/directory values render as `<url>` / `<root>/<name>`
 * placeholders so the preview stays readable before they are typed. The `--`
 * is end-of-options armor the server also uses: a URL or name can never be
 * reinterpreted as a git flag.
 */
export function buildCloneCommand(input: CloneInput): string {
  const parts = ["git", "clone"];
  const branch = input.branch?.trim();
  if (branch !== undefined && branch !== "") {
    parts.push("--branch", branch);
  }
  parts.push("--", input.url.trim() || "<url>");
  const directoryName = input.directoryName.trim();
  parts.push(
    directoryName
      ? `${input.root.replace(/\/+$/, "")}/${directoryName}`
      : "<root>/<name>",
  );
  return parts.join(" ");
}

export { deriveRepoName };
