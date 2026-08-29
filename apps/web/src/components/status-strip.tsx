import type { ReactNode } from "react";

/**
 * Console-style status line shared by the home masthead and the project
 * page: mono digits leading, lowercase labels, hairline separators. One
 * accent vocabulary: "positive" (sage), "warn" (gold); everything else is
 * plain foreground.
 */
export interface StripItem {
  label: string;
  value: ReactNode;
  accent?: "positive" | "warn";
}

/** Null items are a convenient way for callers to drop conditional vitals. */
export function StatusStrip({ items }: { items: (StripItem | null)[] }) {
  const visible = items.filter(
    (it): it is StripItem => it !== null && it.value !== null && it.value !== undefined,
  );
  return (
    <div className="flex flex-wrap items-center font-mono text-[0.7rem] text-muted-foreground">
      {visible.map((item, i) => (
        <span
          key={item.label}
          className={
            "flex items-baseline gap-1.5 whitespace-nowrap" +
            (i > 0 ? " border-l border-foreground/10 ml-3.5 pl-3.5" : "")
          }
        >
          <span
            className="text-[0.8rem] font-semibold leading-none tracking-tight"
            style={
              item.accent === "positive"
                ? { color: "var(--state-positive)" }
                : item.accent === "warn"
                  ? { color: "var(--sev-warn)" }
                  : { color: "var(--foreground)" }
            }
          >
            {item.value}
          </span>
          {item.label}
        </span>
      ))}
    </div>
  );
}
