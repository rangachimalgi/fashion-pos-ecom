"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { listEmployees, type Employee } from "@/lib/employees";
import {
  approvedLeaveBetween,
  attendanceBetween,
  formatClock,
  formatHours,
  hoursWorked,
  inclusiveDays,
  type AttendanceRow,
  type LeaveRequest,
} from "@/lib/attendance";
import { monthEnd, monthStart, periodLabel, todayInShop } from "@/lib/salesReport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Tab = "day" | "month";

type Loaded = {
  from: string;
  to: string;
  employees: Employee[];
  attendance: AttendanceRow[];
  leaves: LeaveRequest[];
};

export default function AttendancePage() {
  const today = todayInShop();
  const [tab, setTab] = useState<Tab>("day");
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));

  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    if (tab === "day") return { from: date, to: date };
    const first = `${month}-01`;
    return { from: monthStart(first), to: monthEnd(first) };
  }, [tab, date, month]);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(range.from) && /^\d{4}-\d{2}-\d{2}$/.test(range.to);
  const waiting = loading && valid;

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    Promise.all([
      listEmployees(supabase),
      attendanceBetween(supabase, range.from, range.to),
      approvedLeaveBetween(supabase, range.from, range.to),
    ])
      .then(([employees, attendance, leaves]) => {
        if (cancelled) return;
        setData({ from: range.from, to: range.to, employees, attendance, leaves });
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load attendance");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, valid]);

  const dayRows = useMemo(() => {
    if (!valid || !data || tab !== "day") return [];
    return data.employees
      .map((employee) => {
        const record = data.attendance.find((row) => row.employee_id === employee.id) ?? null;
        const leave =
          data.leaves.find(
            (item) => item.employee_id === employee.id && item.from_date <= date && item.to_date >= date
          ) ?? null;
        const status: "present" | "leave" | "absent" | "future" = record
          ? "present"
          : leave
            ? "leave"
            : date > today
              ? "future"
              : "absent";
        return { employee, record, leave, status };
      })
      .filter((row) => row.employee.active || row.record)
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  }, [valid, data, tab, date, today]);

  const monthRows = useMemo(() => {
    if (!valid || !data || tab !== "month") return [];
    return data.employees
      .map((employee) => {
        const records = data.attendance.filter((row) => row.employee_id === employee.id);
        const hours = records.reduce((sum, row) => sum + (hoursWorked(row) ?? 0), 0);
        const missed = records.filter((row) => !row.check_out && row.work_date < today).length;
        const leaveDays = data.leaves
          .filter((item) => item.employee_id === employee.id)
          .reduce((sum, item) => {
            const start = item.from_date > data.from ? item.from_date : data.from;
            const end = item.to_date < data.to ? item.to_date : data.to;
            return start <= end ? sum + inclusiveDays(start, end) : sum;
          }, 0);
        return { employee, days: records.length, hours, missed, leaveDays };
      })
      .filter((row) => row.employee.active || row.days > 0)
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  }, [valid, data, tab, today]);

  const counts = useMemo(
    () => ({
      present: dayRows.filter((row) => row.status === "present").length,
      leave: dayRows.filter((row) => row.status === "leave").length,
      absent: dayRows.filter((row) => row.status === "absent").length,
    }),
    [dayRows]
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4">
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={tab === "day" ? "default" : "outline"}
            onClick={() => {
              setLoading(true);
              setTab("day");
            }}
          >
            Day
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "month" ? "default" : "outline"}
            onClick={() => {
              setLoading(true);
              setTab("month");
            }}
          >
            Month
          </Button>
        </div>

        {tab === "day" ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Date
            <Input
              type="date"
              value={date}
              max={today}
              onChange={(event) => {
                setLoading(true);
                setDate(event.target.value);
              }}
              className="h-8 w-40"
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Month
            <Input
              type="month"
              value={month}
              max={today.slice(0, 7)}
              onChange={(event) => {
                setLoading(true);
                setMonth(event.target.value);
              }}
              className="h-8 w-40"
            />
          </label>
        )}

        <p className="text-xs text-muted-foreground">
          {tab === "day" && valid ? periodLabel(date, "day", true) : null}
          {tab === "month" && valid ? periodLabel(`${month}-01`, "month") : null}
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      {tab === "day" ? (
        <>
          <section className="grid grid-cols-3 gap-3">
            {[
              { label: "Present", value: counts.present },
              { label: "On approved leave", value: counts.leave },
              { label: "Absent", value: counts.absent },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-white px-4 py-3">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-xl font-semibold tabular-nums">{waiting ? "…" : card.value}</p>
              </div>
            ))}
          </section>

          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Checked in</TableHead>
                  <TableHead>Checked out</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waiting ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : dayRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      No employees yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  dayRows.map(({ employee, record, status }) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium whitespace-nowrap">{employee.name}</TableCell>
                      <TableCell>
                        {status === "present" ? (
                          <Badge variant="default">Present</Badge>
                        ) : status === "leave" ? (
                          <Badge variant="secondary">On leave</Badge>
                        ) : status === "absent" ? (
                          <Badge variant="destructive">Absent</Badge>
                        ) : (
                          <Badge variant="outline">—</Badge>
                        )}
                        {record && !record.check_out && date < today ? (
                          <span className="ml-2 text-xs text-amber-700">no check-out</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">{record ? formatClock(record.check_in) : "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {record ? (record.check_out ? formatClock(record.check_out) : date === today ? "still in" : "—") : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {record ? formatHours(hoursWorked(record)) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Days present</TableHead>
                <TableHead className="text-right">Leave days (approved)</TableHead>
                <TableHead className="text-right">Hours worked</TableHead>
                <TableHead className="text-right">Missed check-outs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waiting ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : monthRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No employees yet.
                  </TableCell>
                </TableRow>
              ) : (
                monthRows.map(({ employee, days, hours, missed, leaveDays }) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium whitespace-nowrap">{employee.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{days}</TableCell>
                    <TableCell className="text-right tabular-nums">{leaveDays}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatHours(hours)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", missed > 0 && "text-amber-700")}>
                      {missed}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Times are the shop clock when the employee tapped the button, not the phone&apos;s. A missed check-out means
        the employee checked in on an earlier day and never checked out; those days add no hours.
      </p>
    </div>
  );
}
