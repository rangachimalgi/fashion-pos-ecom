import type { Performance } from "@/lib/salesTargets";
import { cn } from "@/lib/utils";

function shortMonth(isoDate: string, back = 0) {
  const [year, month] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1 - back, 1))
  );
}

const STYLES = {
  green: { chip: "border-emerald-300 bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" },
  yellow: { chip: "border-amber-300 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  red: { chip: "border-red-300 bg-red-50 text-red-800", dot: "bg-red-600" },
  none: { chip: "border-border bg-muted/40 text-muted-foreground", dot: "bg-muted-foreground/40" },
} as const;

export function performanceLabel(performance: Performance): { title: string; detail: string } {
  const last = shortMonth(performance.judged_month);
  switch (performance.standing) {
    case "green":
      return { title: "On track", detail: `Met the target in ${last}` };
    case "yellow":
      return { title: "Warning", detail: `Missed the target in ${last}` };
    case "red":
      return {
        title: "Red flag",
        detail: `Missed the target 2 months in a row (${shortMonth(performance.judged_month, 1)} and ${last})`,
      };
    default:
      return { title: "Not rated yet", detail: "Rated after the first full month with a target" };
  }
}

/** Small coloured pill: dot + title. Hover for the reason. */
export function PerformanceBadge({ performance, className }: { performance: Performance; className?: string }) {
  const { title, detail } = performanceLabel(performance);
  const style = STYLES[performance.standing];
  return (
    <span
      title={detail}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        style.chip,
        className
      )}
    >
      <span className={cn("size-2 rounded-full", style.dot)} aria-hidden />
      {title}
    </span>
  );
}

/** Pill plus the reason in words. */
export function PerformanceNote({ performance }: { performance: Performance }) {
  const { detail } = performanceLabel(performance);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PerformanceBadge performance={performance} />
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}
