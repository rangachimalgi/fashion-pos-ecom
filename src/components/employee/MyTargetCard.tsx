"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatInr } from "@/lib/formatOrder";
import { monthStart, todayInShop } from "@/lib/salesReport";
import { fetchMyTarget, targetProgress, type MyTarget } from "@/lib/salesTargets";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, m - 1, 1))
  );
}

/** The signed-in employee's own salary, target, progress and incentive. */
export function MyTargetCard() {
  const thisMonth = todayInShop().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<MyTarget | null>(null);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyTarget(supabase, month)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setLoadedMonth(month);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load your target");
        setLoadedMonth(month);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const loading = loadedMonth !== month;
  const shift = (delta: number) => setMonth(monthStart(`${month}-01`, delta).slice(0, 7));

  const hasTarget = data?.target_amount !== null && data?.target_amount !== undefined;
  const target = data?.target_amount ?? 0;
  const progress = targetProgress({ target_amount: target, achieved: data?.achieved ?? 0 });

  return (
    <section className="rounded-xl border border-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold">My target · {monthLabel(month)}</h2>
        <div className="ml-auto flex gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => shift(-1)} aria-label="Previous month">
            ‹
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => shift(1)}
            disabled={month >= thisMonth}
            aria-label="Next month"
          >
            ›
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading || !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data.linked ? (
        <p className="text-sm text-muted-foreground">
          Your target isn&apos;t set up yet. Ask the admin to link your sales name.
        </p>
      ) : !hasTarget ? (
        <p className="text-sm text-muted-foreground">
          No salary or target has been entered for you yet. You have sold {formatInr(data.achieved)} this month.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">Monthly salary</p>
              <p className="font-semibold tabular-nums">{formatInr(data.monthly_salary ?? 0)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">Target ({data.target_percent}% of salary)</p>
              <p className="font-semibold tabular-nums">{formatInr(target)}</p>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-end justify-between gap-3 text-sm">
              <span>
                <span className="text-lg font-semibold tabular-nums">{formatInr(data.achieved)}</span>
                <span className="text-muted-foreground"> sold</span>
              </span>
              <span className={cn("font-semibold tabular-nums", progress.reached && "text-emerald-700")}>
                {progress.percent.toFixed(progress.percent >= 100 ? 0 : 1)}%
              </span>
            </div>
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(Math.round(progress.percent), 100)}
            >
              <div
                className={cn("h-full rounded-full transition-all", progress.reached ? "bg-emerald-600" : "bg-foreground")}
                style={{ width: `${Math.min(progress.percent, 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-sm">
              {progress.reached ? (
                <span className="font-medium text-emerald-700">
                  Target reached{progress.over > 0 ? `, ${formatInr(progress.over)} above it` : ""}
                </span>
              ) : (
                <>
                  <span className="font-semibold tabular-nums">{formatInr(progress.remaining)}</span>{" "}
                  <span className="text-muted-foreground">left to reach your target</span>
                </>
              )}
            </p>
          </div>

          <div
            className={cn(
              "rounded-lg border px-3 py-2",
              (data.incentive_amount ?? 0) > 0 ? "border-emerald-300 bg-emerald-50" : "border-border"
            )}
          >
            <p className="text-xs text-muted-foreground">
              Incentive · {data.incentive_percent}% of sales above your target
            </p>
            <p className="text-lg font-semibold tabular-nums">{formatInr(data.incentive_amount ?? 0)}</p>
          </div>
        </div>
      )}
    </section>
  );
}
