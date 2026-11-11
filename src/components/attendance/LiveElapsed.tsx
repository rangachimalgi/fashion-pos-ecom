"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

// One shared clock: every timer on the page re-renders together, once a second.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => listeners.forEach((fn) => fn()), 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const snapshot = () => Math.floor(Date.now() / 1000) * 1000;
const serverSnapshot = () => 0;

/** The current time, ticking every second. 0 during server rendering. */
export function useTickingNow(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** 3h 07m 09s, or 7m 09s when under an hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
}

/** 03:07:09 */
export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Time since `since` (ISO), counting up live. */
export function LiveElapsed({
  since,
  stopwatch = false,
  className,
}: {
  since: string;
  stopwatch?: boolean;
  className?: string;
}) {
  const now = useTickingNow();
  const start = new Date(since).getTime();
  const ms = now === 0 || Number.isNaN(start) ? 0 : now - start;
  return (
    <span className={cn("tabular-nums", className)} suppressHydrationWarning>
      {stopwatch ? formatStopwatch(ms) : formatElapsed(ms)}
    </span>
  );
}
