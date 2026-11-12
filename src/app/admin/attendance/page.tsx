"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { listEmployees, type Employee } from "@/lib/employees";
import {
  adminCheckIn,
  adminCheckOut,
  adminDeleteAttendance,
  adminSetAttendance,
  approvedLeaveBetween,
  attendanceBetween,
  clockInput,
  formatClock,
  formatHours,
  hoursWorked,
  inclusiveDays,
  type AttendanceRow,
  type LeaveRequest,
} from "@/lib/attendance";
import { monthEnd, monthStart, periodLabel, todayInShop } from "@/lib/salesReport";
import { LiveElapsed } from "@/components/attendance/LiveElapsed";
import { LocationSettings } from "@/components/admin/attendance/LocationSettings";
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

type Editor = { employeeId: string; checkIn: string; checkOut: string };

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
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
  }, [range, valid, reloadKey]);

  async function act(employeeId: string, success: string, run: () => Promise<void>) {
    setBusy(employeeId);
    setActionError(null);
    setNotice(null);
    try {
      await run();
      setNotice(success);
      setEditor(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  function openEditor(employeeId: string, record: AttendanceRow | null) {
    setActionError(null);
    setNotice(null);
    setEditor({
      employeeId,
      checkIn: record ? clockInput(record.check_in) : "09:30",
      checkOut: record ? clockInput(record.check_out) : "",
    });
  }

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
                setEditor(null);
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

      {tab === "day" ? <LocationSettings /> : null}

      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      {actionError ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {actionError}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waiting ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : dayRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                      No employees yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  dayRows.map(({ employee, record, status }) => {
                    const isBusy = busy === employee.id;
                    const editing = editor?.employeeId === employee.id ? editor : null;
                    const isToday = date === today;
                    return (
                      <Fragment key={employee.id}>
                        <TableRow>
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
                            {record && (record.source === "admin" || record.edited_by_email) ? (
                              <span
                                className="ml-2 text-xs text-muted-foreground"
                                title={record.edited_by_email ? `By ${record.edited_by_email}` : undefined}
                              >
                                {record.source === "admin" ? "added by admin" : "edited by admin"}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {record ? formatClock(record.check_in) : "—"}
                            {record?.check_in_distance_m != null ? (
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                {record.check_in_distance_m} m from shop
                                {record.check_in_accuracy_m != null
                                  ? ` · ±${Math.round(record.check_in_accuracy_m)} m`
                                  : ""}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {record ? (record.check_out ? formatClock(record.check_out) : isToday ? "still in" : "—") : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {record && !record.check_out && isToday ? (
                              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                                <span className="relative flex size-2">
                                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                                  <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
                                </span>
                                <LiveElapsed since={record.check_in} />
                              </span>
                            ) : record ? (
                              formatHours(hoursWorked(record))
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {isToday && !record ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => act(employee.id, `${employee.name} checked in.`, () => adminCheckIn(supabase, employee.id))}
                                >
                                  Check in
                                </Button>
                              ) : null}
                              {isToday && record && !record.check_out ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => act(employee.id, `${employee.name} checked out.`, () => adminCheckOut(supabase, employee.id))}
                                >
                                  Check out
                                </Button>
                              ) : null}
                              {date <= today ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() => (editing ? setEditor(null) : openEditor(employee.id, record))}
                                >
                                  {record ? "Edit" : "Set times"}
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                        {editing ? (
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={6}>
                              <div className="flex flex-wrap items-end gap-3 py-1">
                                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                  Check-in
                                  <Input
                                    type="time"
                                    value={editing.checkIn}
                                    onChange={(event) => setEditor({ ...editing, checkIn: event.target.value })}
                                    className="h-8 w-32"
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                  Check-out (optional)
                                  <Input
                                    type="time"
                                    value={editing.checkOut}
                                    onChange={(event) => setEditor({ ...editing, checkOut: event.target.value })}
                                    className="h-8 w-32"
                                  />
                                </label>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isBusy || !editing.checkIn}
                                  onClick={() =>
                                    act(employee.id, `Saved ${employee.name}'s attendance.`, () =>
                                      adminSetAttendance(supabase, employee.id, date, editing.checkIn, editing.checkOut)
                                    )
                                  }
                                >
                                  Save
                                </Button>
                                <Button type="button" size="sm" variant="ghost" disabled={isBusy} onClick={() => setEditor(null)}>
                                  Cancel
                                </Button>
                                {record ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={isBusy}
                                    className="ml-auto text-destructive hover:text-destructive"
                                    onClick={() => {
                                      if (!window.confirm(`Remove ${employee.name}'s attendance for this day?`)) return;
                                      void act(employee.id, `Removed ${employee.name}'s attendance.`, () =>
                                        adminDeleteAttendance(supabase, employee.id, date)
                                      );
                                    }}
                                  >
                                    Remove day
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })
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
        Times are the shop clock when the button was tapped, not the phone&apos;s. Use Check in / Check out for today,
        or Edit / Set times to add or correct any earlier day. A missed check-out means someone checked in on an
        earlier day and never checked out; those days add no hours.
      </p>
    </div>
  );
}
