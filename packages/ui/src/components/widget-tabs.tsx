import { Tabs, TabsList, TabsTrigger } from "@workspace-welcome/ui/components/tabs";
import { cn } from "@workspace-welcome/ui/lib/utils";

/**
 * WidgetTabs — THE one tabs implementation for the widget system: shell
 * view switching and in-content tabs are this one component in two
 * placements. Built ON the ui `Tabs` primitives (per-theme skins come from
 * chrome tokens, not new components). Renders the tab list only — the
 * caller owns the panel content.
 */

export interface WidgetTab {
  id: string;
  label: string;
}

export interface WidgetTabsProps {
  tabs: WidgetTab[];
  active: string;
  onChange: (id: string) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}

export const MIN_CONTENT = { w: 120, h: 28 };

export function WidgetTabs({
  tabs,
  active,
  onChange,
  size = "md",
  ariaLabel,
  className,
}: WidgetTabsProps) {
  return (
    <Tabs
      value={active}
      onValueChange={(value) => onChange(value ?? active)}
      className={cn("gap-0", className)}
    >
      <TabsList
        variant="line"
        aria-label={ariaLabel}
        className={cn(size === "sm" && "h-6 gap-0.5 p-0.5")}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className={cn("px-2", size === "sm" && "text-[10px]")}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
