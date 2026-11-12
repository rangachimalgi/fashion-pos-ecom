"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { formatInr } from "@/lib/formatOrder";
import { monthEnd, monthStart, todayInShop } from "@/lib/salesReport";
import {
  DEFAULT_INCENTIVE_PERCENT,
  DEFAULT_TARGET_PERCENT,
  clearTarget,
  fetchPerformance,
  fetchTargetProgress,
  incentiveFor,
  saveTarget,
  targetFor,
  targetProgress,
  type Performance,
  type TargetRow,
} from "@/lib/salesTargets";
import { PerformanceNote } from "@/components/targets/PerformanceBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TeamBackLink } from "@/components/admin/team/TeamBackLink";

function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, m - 1, 1))
  );
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
function daysBetween(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

function ProgressLine({ achieved, target, reached }: { achieved: number; target: number; reached: boolean }) {
  const percent = target > 0 ? Math.min((achieved / target) * 100, 100) : 0;
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div
        className={cn("h-full rounded-full transition-all", reached ? "bg-emerald-600" : "bg-foreground")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function PersonCard({
  row,
  employeeId,
  performance,
  pace,
  busy,
  onSave,
  onClear,
}: {
  row: TargetRow;
  employeeId: string | null;
  performance: Performance | null;
  pace: { daysLeft: number } | null;
  busy: boolean;
  onSave: (salary: number, percent: number, incentive: number) => void;
  onClear: () => void;
}) {
  const hasTarget = row.target_amount !== null;
  const [editing, setEditing] = useState(!hasTarget);
  const [salary, setSalary] = useState(row.monthly_salary === null ? "" : String(row.monthly_salary));
  const [percent, setPercent] = useState(String(row.target_percent ?? DEFAULT_TARGET_PERCENT));
  const [incentive, setIncentive] = useState(String(row.incentive_percent ?? DEFAULT_INCENTIVE_PERCENT));
  const [problem, setProblem] = useState<string | null>(null);

  const salaryValue = Number(salary);
  const percentValue = Number(percent);
  const salaryOk = salary.trim() !== "" && Number.isFinite(salaryValue) && salaryValue >= 0 && salaryValue <= 10_000_000;
  const percentOk = percent.trim() !== "" && Number.isFinite(percentValue) && percentValue >= 0 && percentValue <= 100_000;
  const incentiveValue = Number(incentive);
  const incentiveOk =
    incentive.trim() !== "" && Number.isFinite(incentiveValue) && incentiveValue >= 0 && incentiveValue <= 100;
  const preview = salaryOk && percentOk ? targetFor(salaryValue, percentValue) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!salaryOk) return setProblem("Enter the monthly salary as a number, for example 20000.");
    if (!percentOk) return setProblem("Enter the target percentage, for example 1500.");
    if (!incentiveOk) return setProblem("Enter the incentive percentage between 0 and 100, for example 1.");
    setProblem(null);
    onSave(salaryValue, percentValue, incentiveValue);
    setEditing(false);
  };

  const progress = targetProgress(row);

  return (
    <div className="rounded-xl border border-border bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">
          {employeeId ? (
            <Link href={`/admin/team/${employeeId}`} className="hover:underline underline-offset-2">
              {row.name}
            </Link>
          ) : (
            row.name
          )}
        </h3>
        {!row.active ? <Badge variant="outline">Inactive</Badge> : null}
        {hasTarget && !editing ? (
          <div className="ml-auto flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Remove ${row.name}'s salary and target?`)) onClear();
              }}
            >
              Remove
            </Button>
          </div>
        ) : null}
      </div>

      {hasTarget && !editing ? (
        <div className="mt-3 flex flex-col gap-2">
          {performance && performance.standing !== "none" ? <PerformanceNote performance={performance} /> : null}
          <p className="text-xs text-muted-foreground">
            Salary {formatInr(row.monthly_salary ?? 0)} × {row.target_percent}% = target{" "}
            {formatInr(row.target_amount ?? 0)} · incentive {row.incentive_percent ?? DEFAULT_INCENTIVE_PERCENT}% of
            sales above target
          </p>

          <div className="flex items-end justify-between gap-3 text-sm">
            <span>
              <span className="text-lg font-semibold tabular-nums">{formatInr(row.achieved)}</span>
              <span className="text-muted-foreground"> of {formatInr(row.target_amount ?? 0)}</span>
            </span>
            <span className={cn("font-semibold tabular-nums", progress.reached && "text-emerald-700")}>
              {progress.percent.toFixed(progress.percent >= 100 ? 0 : 1)}%
            </span>
          </div>

          <ProgressLine achieved={row.achieved} target={row.target_amount ?? 0} reached={progress.reached} />

          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
            {progress.reached ? (
              <span className="font-medium text-emerald-700">
                Target reached{progress.over > 0 ? `, ${formatInr(progress.over)} over` : ""}
              </span>
            ) : (
              <span>
                <span className="font-semibold tabular-nums">{formatInr(progress.remaining)}</span>{" "}
                <span className="text-muted-foreground">remaining</span>
              </span>
            )}
            <span className="text-muted-foreground">
              {row.bills} {row.bills === 1 ? "bill" : "bills"}
              {pace && !progress.reached
                ? pace.daysLeft > 0
                  ? ` · ${pace.daysLeft} ${pace.daysLeft === 1 ? "day" : "days"} left · needs ${formatInr(
                      Math.ceil(progress.remaining / pace.daysLeft)
                    )} a day`
                  : ""
                : ""}
            </span>
          </div>

          <p className="text-sm">
            <span className="text-muted-foreground">Incentive earned: </span>
            <span className={cn("font-semibold tabular-nums", (row.incentive_amount ?? 0) > 0 && "text-emerald-700")}>
              {formatInr(row.incentive_amount ?? 0)}
            </span>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Monthly salary (₹)</span>
              <Input
                inputMode="decimal"
                value={salary}
                onChange={(event) => setSalary(event.target.value)}
                placeholder="20000"
                autoFocus={!hasTarget}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Target (% of salary)</span>
              <Input
                inputMode="decimal"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                placeholder="1500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Incentive (% of sales above target)</span>
              <Input
                inputMode="decimal"
                value={incentive}
                onChange={(event) => setIncentive(event.target.value)}
                placeholder="1"
              />
            </label>
          </div>
          <p className="text-sm">
            {preview !== null ? (
              <>
                Monthly target: <span className="font-semibold tabular-nums">{formatInr(preview)}</span>
                {incentiveOk ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · every ₹100 above it earns ₹{incentiveFor(0, 100, incentiveValue)}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">Enter both to see the target.</span>
            )}
          </p>
          {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              Save
            </Button>
            {hasTarget ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setProblem(null);
                  setSalary(String(row.monthly_salary ?? ""));
                  setPercent(String(row.target_percent ?? DEFAULT_TARGET_PERCENT));
                  setIncentive(String(row.incentive_percent ?? DEFAULT_INCENTIVE_PERCENT));
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}

export default function TargetsPage() {
  const today = todayInShop();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [rows, setRows] = useState<TargetRow[]>([]);
  // null = migration 029 not run yet
  const [performance, setPerformance] = useState<Map<string, Performance> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [employeeBySales, setEmployeeBySales] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase
      .from("employees")
      .select("id, sales_person_id")
      .not("sales_person_id", "is", null)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const row of data ?? []) map[String(row.sales_person_id)] = String(row.id);
        setEmployeeBySales(map);
      });
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTargetProgress(supabase, month), fetchPerformance(supabase, month)])
      .then(([next, colours]) => {
        if (cancelled) return;
        setRows(next);
        setPerformance(colours);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load targets");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, reloadKey]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setReloadKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // Days left only make sense for the month that is running now (today counts).
  const pace = useMemo(() => {
    if (month !== today.slice(0, 7)) return null;
    return { daysLeft: daysBetween(today, monthEnd(today)) + 1 };
  }, [month, today]);

  const team = useMemo(() => {
    const withTarget = rows.filter((row) => row.target_amount !== null);
    const target = withTarget.reduce((sum, row) => sum + (row.target_amount ?? 0), 0);
    const achieved = withTarget.reduce((sum, row) => sum + row.achieved, 0);
    const incentive = withTarget.reduce((sum, row) => sum + (row.incentive_amount ?? 0), 0);
    return {
      count: withTarget.length,
      target,
      achieved,
      incentive,
      ...targetProgress({ target_amount: target, achieved }),
    };
  }, [rows]);

  const colourCounts = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0 };
    if (!performance) return counts;
    for (const row of rows) {
      if (row.target_amount === null) continue;
      const standing = performance.get(row.sales_person_id)?.standing;
      if (standing === "green" || standing === "yellow" || standing === "red") counts[standing] += 1;
    }
    return counts;
  }, [rows, performance]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        // People still to be set up go last; the rest by how far along they are.
        const aSet = a.target_amount !== null;
        const bSet = b.target_amount !== null;
        if (aSet !== bSet) return aSet ? -1 : 1;
        return targetProgress(b).percent - targetProgress(a).percent || a.name.localeCompare(b.name);
      }),
    [rows]
  );

  const shiftMonth = (delta: number) => setMonth(monthStart(`${month}-01`, delta).slice(0, 7));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <TeamBackLink />
          <h2 className="mt-2 text-lg font-semibold tracking-tight">Sales targets</h2>
          <p className="text-sm text-muted-foreground">
            Target = salary × target %. Sales above the target earn an incentive. Sales are POS bills each person attended in the month.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            ‹
          </Button>
          <Input
            type="month"
            value={month}
            onChange={(event) => {
              if (!event.target.value) return;
              setLoading(true);
              setMonth(event.target.value);
            }}
            className="h-8 w-40"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => shiftMonth(1)}
            disabled={month >= today.slice(0, 7)}
            aria-label="Next month"
          >
            ›
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      {/* ---------- Whole team ---------- */}
      <section className="rounded-xl border border-border bg-white px-4 py-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="font-semibold">Whole team · {monthLabel(month)}</h3>
          <span className="text-xs text-muted-foreground">
            {team.count} {team.count === 1 ? "person" : "people"} with a target
          </span>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : team.count === 0 ? (
          <p className="text-sm text-muted-foreground">Set a salary for someone below to start tracking.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-end justify-between gap-3 text-sm">
              <span>
                <span className="text-lg font-semibold tabular-nums">{formatInr(team.achieved)}</span>
                <span className="text-muted-foreground"> of {formatInr(team.target)}</span>
              </span>
              <span className="font-semibold tabular-nums">{team.percent.toFixed(1)}%</span>
            </div>
            <ProgressLine achieved={team.achieved} target={team.target} reached={team.reached} />
            <p className="text-sm">
              {team.reached ? (
                <span className="font-medium text-emerald-700">Team target reached</span>
              ) : (
                <>
                  <span className="font-semibold tabular-nums">{formatInr(team.remaining)}</span>{" "}
                  <span className="text-muted-foreground">remaining</span>
                </>
              )}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Incentive earned by the team: </span>
              <span className="font-semibold tabular-nums">{formatInr(team.incentive)}</span>
            </p>
            {performance ? (
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm">
                <span className="text-muted-foreground">Performance:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-600" aria-hidden />
                  <span className="font-semibold tabular-nums">{colourCounts.green}</span> on track
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-500" aria-hidden />
                  <span className="font-semibold tabular-nums">{colourCounts.yellow}</span> warning
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-red-600" aria-hidden />
                  <span className="font-semibold tabular-nums">{colourCounts.red}</span> red
                </span>
              </p>
            ) : null}
          </div>
        )}
      </section>

      {/* ---------- Each person ---------- */}
      <section className="flex flex-col gap-3">
        {loading ? null : sorted.length === 0 ? (
          <p className="rounded-xl border border-border bg-white px-4 py-6 text-center text-sm text-muted-foreground">
            No salespeople yet. Add them under Sales team first.
          </p>
        ) : (
          sorted.map((row) => (
            <PersonCard
              // key includes the saved values so the form resets after a save
              key={`${row.sales_person_id}-${row.monthly_salary}-${row.target_percent}-${row.incentive_percent}`}
              row={row}
              employeeId={employeeBySales[row.sales_person_id] ?? null}
              performance={performance?.get(row.sales_person_id) ?? null}
              pace={pace}
              busy={busy}
              onSave={(salary, percent, incentive) =>
                run(() => saveTarget(supabase, row.sales_person_id, salary, percent, incentive))
              }
              onClear={() => run(() => clearTarget(supabase, row.sales_person_id))}
            />
          ))
        )}
      </section>

      {performance === null && !loading && !error ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Run supabase/migrations/029_performance_standing.sql in the SQL Editor to see the performance colours.
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Colours: green = met the target last finished month, yellow = missed 1 month, red = missed 2 months in a row.
        The running month is never judged, and a month only counts once it starts after the target was set and the
        person was added. Past months are measured against the salary and percentage saved today. Only admins can see this page.
      </p>
    </div>
  );
}
