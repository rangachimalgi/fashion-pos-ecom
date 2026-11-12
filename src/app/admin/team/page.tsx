"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  IdCard,
  Target,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { listEmployees } from "@/lib/employees";
import {
  attendanceBetween,
  countPendingLeaves,
  approvedLeaveBetween,
} from "@/lib/attendance";
import { fetchTargetProgress, targetProgress } from "@/lib/salesTargets";
import { listSalesPeople } from "@/lib/salesPeople";
import { todayInShop } from "@/lib/salesReport";
import { cn } from "@/lib/utils";

type Snapshot = {
  activeEmployees: number;
  totalEmployees: number;
  presentToday: number;
  onLeaveToday: number;
  absentToday: number;
  pendingLeaves: number;
  salesNames: number;
  targetPeople: number;
  teamPercent: number | null;
  teamReached: boolean;
};

type Tile = {
  href: string;
  title: string;
  description: string;
  icon: typeof IdCard;
  value: string;
  hint?: string;
  accent?: "amber" | "emerald" | null;
};

export default function TeamHubPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const today = todayInShop();
    const month = today.slice(0, 7);

    Promise.all([
      listEmployees(supabase),
      attendanceBetween(supabase, today, today).catch(() => []),
      approvedLeaveBetween(supabase, today, today).catch(() => []),
      countPendingLeaves(supabase),
      listSalesPeople(supabase).catch(() => []),
      fetchTargetProgress(supabase, month).catch(() => []),
    ])
      .then(([employees, attendance, leaves, pendingLeaves, salesPeople, targets]) => {
        if (cancelled) return;
        const active = employees.filter((employee) => employee.active);
        const presentIds = new Set(attendance.map((row) => row.employee_id));
        const leaveIds = new Set(
          leaves
            .filter((item) => item.from_date <= today && item.to_date >= today)
            .map((item) => item.employee_id)
        );
        let present = 0;
        let onLeave = 0;
        let absent = 0;
        for (const employee of active) {
          if (presentIds.has(employee.id)) present += 1;
          else if (leaveIds.has(employee.id)) onLeave += 1;
          else absent += 1;
        }

        const withTarget = targets.filter((row) => row.target_amount !== null);
        const teamTarget = withTarget.reduce((sum, row) => sum + (row.target_amount ?? 0), 0);
        const teamAchieved = withTarget.reduce((sum, row) => sum + row.achieved, 0);
        const progress = targetProgress({ target_amount: teamTarget, achieved: teamAchieved });

        setData({
          activeEmployees: active.length,
          totalEmployees: employees.length,
          presentToday: present,
          onLeaveToday: onLeave,
          absentToday: absent,
          pendingLeaves,
          salesNames: salesPeople.filter((person) => person.active).length,
          targetPeople: withTarget.length,
          teamPercent: withTarget.length ? progress.percent : null,
          teamReached: progress.reached,
        });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the team overview");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const tiles: Tile[] = [
    {
      href: "/admin/employees",
      title: "Employees",
      description: "Add, edit and deactivate staff logins",
      icon: IdCard,
      value: data ? String(data.activeEmployees) : "…",
      hint: data
        ? `${data.activeEmployees} active${data.totalEmployees !== data.activeEmployees ? ` · ${data.totalEmployees} total` : ""}`
        : undefined,
    },
    {
      href: "/admin/attendance",
      title: "Attendance",
      description: "Check people in and out, day and month view",
      icon: CalendarCheck,
      value: data ? String(data.presentToday) : "…",
      hint: data
        ? `${data.presentToday} in · ${data.onLeaveToday} leave · ${data.absentToday} out`
        : undefined,
    },
    {
      href: "/admin/leave",
      title: "Leave",
      description: "Approve or reject leave requests",
      icon: CalendarDays,
      value: data ? String(data.pendingLeaves) : "…",
      hint: data?.pendingLeaves ? "waiting for a decision" : "nothing waiting",
      accent: data && data.pendingLeaves > 0 ? "amber" : null,
    },
    {
      href: "/admin/targets",
      title: "Targets",
      description: "Salary, monthly target and incentive",
      icon: Target,
      value: data?.teamPercent != null ? `${data.teamPercent.toFixed(0)}%` : data ? "—" : "…",
      hint: data
        ? data.targetPeople
          ? `${data.targetPeople} with a target${data.teamReached ? " · reached" : ""}`
          : "set salaries to start"
        : undefined,
      accent: data?.teamReached ? "emerald" : null,
    },
    {
      href: "/admin/sales-team",
      title: "Sales names",
      description: "POS “Attended by” names not tied to a login",
      icon: Users,
      value: data ? String(data.salesNames) : "…",
      hint: "mostly managed when you add an employee",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Team</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          People, attendance, leave, targets and sales names — pick a tile.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className={cn(
                "group flex flex-col rounded-xl border border-border bg-white p-4 transition-colors hover:border-foreground/20 hover:bg-muted/30",
                tile.accent === "amber" && "border-amber-300/80",
                tile.accent === "emerald" && "border-emerald-300/80"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Icon className="size-4" />
                </span>
                <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <p className="mt-4 text-sm font-semibold">{tile.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{tile.description}</p>
              <p
                className={cn(
                  "mt-4 text-2xl font-semibold tracking-tight tabular-nums",
                  tile.accent === "amber" && "text-amber-700",
                  tile.accent === "emerald" && "text-emerald-700"
                )}
              >
                {tile.value}
              </p>
              {tile.hint ? <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p> : null}
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: open any employee&apos;s name (from attendance, leave or people) to see their full page —
        hours, leave, target and contact details.
      </p>
    </div>
  );
}
