"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Pencil, Phone } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getEmployee, type Employee } from "@/lib/employees";
import {
  LEAVE_STATUS_LABEL,
  attendanceBetween,
  formatClock,
  formatHours,
  hoursWorked,
  inclusiveDays,
  listLeaveRequests,
  type AttendanceRow,
  type LeaveWithEmployee,
} from "@/lib/attendance";
import { LiveElapsed } from "@/components/attendance/LiveElapsed";
import {
  fetchPerformance,
  fetchTargetProgress,
  targetProgress,
  type Performance,
  type TargetRow,
} from "@/lib/salesTargets";
import { listSalesPeople } from "@/lib/salesPeople";
import { maskAadhaar } from "@/lib/employeeValidation";
import { formatInr } from "@/lib/formatOrder";
import { monthEnd, monthStart, periodLabel, todayInShop } from "@/lib/salesReport";
import { TeamBackLink } from "@/components/admin/team/TeamBackLink";
import { PerformanceNote } from "@/components/targets/PerformanceBadge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Loaded = {
  employee: Employee;
  attendance: AttendanceRow[];
  leaves: LeaveWithEmployee[];
  target: TargetRow | null;
  performance: Performance | null;
  salesName: string | null;
};

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-white">
      <h3 className="border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const today = todayInShop();
  const month = today.slice(0, 7);

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const from = monthStart(`${month}-01`);
    const to = monthEnd(`${month}-01`);

    (async () => {
      try {
        const employee = await getEmployee(supabase, id);
        if (!employee) throw new Error("Employee not found");

        const [attendance, leaves, targets, salesPeople, colours] = await Promise.all([
          attendanceBetween(supabase, from, to),
          listLeaveRequests(supabase),
          employee.sales_person_id
            ? fetchTargetProgress(supabase, month).catch(() => [] as TargetRow[])
            : Promise.resolve([] as TargetRow[]),
          listSalesPeople(supabase).catch(() => []),
          employee.sales_person_id
            ? fetchPerformance(supabase, month).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const target =
          employee.sales_person_id
            ? targets.find((row) => row.sales_person_id === employee.sales_person_id) ?? null
            : null;
        const performance =
          employee.sales_person_id && colours
            ? colours.get(employee.sales_person_id) ?? null
            : null;
        const salesName =
          employee.sales_person_id
            ? salesPeople.find((person) => person.id === employee.sales_person_id)?.name ?? null
            : null;

        setData({
          employee,
          attendance: attendance.filter((row) => row.employee_id === employee.id),
          leaves: leaves.filter((item) => item.employee_id === employee.id),
          target,
          performance,
          salesName,
        });
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load this employee");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, month]);

  const stats = useMemo(() => {
    if (!data) return null;
    const hours = data.attendance.reduce((sum, row) => sum + (hoursWorked(row) ?? 0), 0);
    const days = data.attendance.length;
    const todayRow = data.attendance.find((row) => row.work_date === today) ?? null;
    const leaveDays = data.leaves
      .filter((item) => item.status === "approved")
      .reduce((sum, item) => {
        const start = item.from_date > monthStart(`${month}-01`) ? item.from_date : monthStart(`${month}-01`);
        const end = item.to_date < monthEnd(`${month}-01`) ? item.to_date : monthEnd(`${month}-01`);
        return start <= end ? sum + inclusiveDays(start, end) : sum;
      }, 0);
    return { hours, days, todayRow, leaveDays };
  }, [data, today, month]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 md:px-6">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4">
        <p className="text-sm text-destructive">{error || "Employee not found"}</p>
        <Link href="/admin/team" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Back to team
        </Link>
      </div>
    );
  }

  const { employee, attendance, leaves, target, performance, salesName } = data;
  const progress = target ? targetProgress(target) : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <TeamBackLink />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{employee.name}</h2>
            {employee.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Login off</Badge>}
            {employee.sales_person_id ? <Badge variant="outline">Sales</Badge> : null}
            {!employee.user_id ? <Badge variant="destructive">No login</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{periodLabel(`${month}-01`, "month")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/attendance?date=${today}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Attendance
          </Link>
          <Link
            href={`/admin/employees?edit=${employee.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Pencil className="size-3.5" />
            Edit
          </Link>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-5">
          {/* Today */}
          <Panel title="Today">
            <div className="px-4 py-4">
              {!stats?.todayRow ? (
                <p className="text-sm text-muted-foreground">Not checked in today.</p>
              ) : stats.todayRow.check_out ? (
                <p className="text-sm">
                  In {formatClock(stats.todayRow.check_in)} · out {formatClock(stats.todayRow.check_out)} ·{" "}
                  <span className="font-semibold tabular-nums">{formatHours(hoursWorked(stats.todayRow))}</span>
                </p>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="relative flex size-2.5 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-600" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Checked in at {formatClock(stats.todayRow.check_in)} · still in
                    </p>
                    <LiveElapsed
                      since={stats.todayRow.check_in}
                      stopwatch
                      className="text-2xl font-semibold tracking-tight tabular-nums"
                    />
                  </div>
                </div>
              )}
              {stats?.todayRow?.check_in_distance_m != null ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {stats.todayRow.check_in_distance_m} m from shop
                  {stats.todayRow.check_in_accuracy_m != null
                    ? ` · ±${Math.round(stats.todayRow.check_in_accuracy_m)} m`
                    : ""}
                </p>
              ) : null}
            </div>
          </Panel>

          {/* Month attendance */}
          <Panel title={`This month · ${stats?.days ?? 0} days · ${formatHours(stats?.hours ?? 0)}`}>
            {attendance.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No attendance this month.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Day</th>
                      <th className="px-3 py-2 font-medium">In</th>
                      <th className="px-3 py-2 font-medium">Out</th>
                      <th className="px-4 py-2 text-right font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...attendance].reverse().map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2 whitespace-nowrap">{periodLabel(row.work_date, "day")}</td>
                        <td className="px-3 py-2 tabular-nums">{formatClock(row.check_in)}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.check_out ? (
                            formatClock(row.check_out)
                          ) : row.work_date === today ? (
                            <span className="text-emerald-700">still in</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {row.check_out ? (
                            formatHours(hoursWorked(row))
                          ) : row.work_date === today ? (
                            <LiveElapsed since={row.check_in} className="text-emerald-700" />
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Leave */}
          <Panel title={`Leave · ${stats?.leaveDays ?? 0} approved days this month`}>
            {leaves.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No leave requests.</p>
            ) : (
              <ul className="divide-y divide-border">
                {leaves.slice(0, 8).map((item) => (
                  <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {item.from_date === item.to_date
                          ? periodLabel(item.from_date, "day")
                          : `${periodLabel(item.from_date, "day")} – ${periodLabel(item.to_date, "day")}`}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
                    </div>
                    <Badge
                      variant={
                        item.status === "approved"
                          ? "default"
                          : item.status === "rejected"
                            ? "destructive"
                            : item.status === "pending"
                              ? "secondary"
                              : "outline"
                      }
                    >
                      {LEAVE_STATUS_LABEL[item.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Contact">
            <dl className="divide-y divide-border text-sm">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted-foreground">Phone</dt>
                <dd>
                  <a href={`tel:+91${employee.phone}`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
                    <Phone className="size-3.5 text-muted-foreground" />
                    {employee.phone}
                  </a>
                </dd>
              </div>
              <div className="px-4 py-2.5">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="mt-1 font-medium leading-relaxed">{employee.address || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted-foreground">Aadhaar</dt>
                <dd className="font-mono text-xs tabular-nums">{maskAadhaar(employee.aadhaar) || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted-foreground">PAN</dt>
                <dd className="font-mono text-xs tabular-nums">{employee.pan || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted-foreground">Sales name</dt>
                <dd className="font-medium">{salesName || "Not in sales team"}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Target">
            {!employee.sales_person_id ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                Not linked to a sales name. Helpers do not get a target.
              </p>
            ) : !target || target.target_amount == null ? (
              <div className="px-4 py-4 text-sm">
                <p className="text-muted-foreground">No salary / target set yet.</p>
                <Link href="/admin/targets" className="mt-2 inline-block text-xs font-medium underline-offset-2 hover:underline">
                  Open targets
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3 px-4 py-4">
                {performance && performance.standing !== "none" ? (
                  <PerformanceNote performance={performance} />
                ) : null}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Salary</p>
                    <p className="font-semibold tabular-nums">{formatInr(target.monthly_salary ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Target</p>
                    <p className="font-semibold tabular-nums">{formatInr(target.target_amount)}</p>
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold tabular-nums">{formatInr(target.achieved)}</span>
                    <span className="tabular-nums text-muted-foreground">{progress?.percent.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", progress?.reached ? "bg-emerald-600" : "bg-foreground")}
                      style={{ width: `${Math.min(progress?.percent ?? 0, 100)}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">Incentive: </span>
                  <span className="font-semibold tabular-nums">{formatInr(target.incentive_amount ?? 0)}</span>
                </p>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
