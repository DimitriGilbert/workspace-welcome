import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@workspace-welcome/ui/lib/utils";

/** 2×2 kiln mark used next to the wordmark. */
export function WorkspaceBrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid size-4 grid-cols-2 grid-rows-2 gap-[3px]", className)}
    >
      <span className="rounded-[1px] bg-primary" />
      <span className="rounded-[1px] bg-foreground/20" />
      <span className="rounded-[1px] bg-foreground/20" />
      <span className="rounded-[1px] bg-[var(--recency-fresh)]" />
    </span>
  );
}

/**
 * App identity chrome — same mark + mono “workspace” as apps/web.
 * Pass `render={<Link to="/" />}` (or an `<a>`) like other Base UI buttons.
 */
export function WorkspaceBrand({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "flex items-center gap-2.5 transition-opacity hover:opacity-80",
          className,
        ),
        children: (
          <>
            <WorkspaceBrandMark />
            <span className="font-mono text-[0.8rem] font-medium tracking-tight">
              workspace
            </span>
          </>
        ),
      },
      props,
    ),
    render,
  });
}
