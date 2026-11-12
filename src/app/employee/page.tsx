"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  LEAVE_STATUS_LABEL,
  cancelLeave,
  checkIn,
  checkOut,
  formatClock,
  formatHours,
  hoursWorked,
  inclusiveDays,
  myAttendance,
  myEmployee,
  myLeaves,
  requestLeave,
  attendanceLocationRules,
  type AttendanceLocationRules,
  type AttendanceRow,
  type LeaveRequest,
  type MyEmployee,
} from "@/lib/attendance";
import { monthStart, periodLabel, todayInShop } from "@/lib/salesReport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MyTargetCard } from "@/components/employee/MyTargetCard";
import { LiveElapsed } from "@/components/attendance/LiveElapsed";
import { getPhonePosition } from "@/lib/geo";

type Loaded = {
  employee: MyEmployee;
  attendance: AttendanceRow[];
  leaves: LeaveRequest[];
  today: string;
  location: AttendanceLocationRules | null;
};

function leaveDates(item: { from_date: string; to_date: string }) {
  const days = inclusiveDays(item.from_date, item.to_date);
  const label =
    item.from_date === item.to_date
      ? periodLabel(item.from_date, "day")
      : `${periodLabel(item.from_date, "day")} to ${periodLabel(item.to_date, "day")}`;
  return `${label} (${days} day${days === 1 ? "" : "s"})`;
}

export default function EmployeePage() {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [notEmployee, setNotEmployee] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const employee = await myEmployee(supabase);
        if (cancelled) return;
        if (!employee) {
          setNotEmployee(true);
          setLoading(false);
          return;
        }
        const today = todayInShop();
        const [attendance, leaves, location] = await Promise.all([
          myAttendance(supabase, monthStart(today), today),
          myLeaves(supabase),
          attendanceLocationRules(supabase),
        ]);
        if (cancelled) return;
        setData({ employee, attendance, leaves, today, location });
        setNotEmployee(false);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load your page");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/employee/login");
    router.refresh();
  };

  const run = async (action: () => Promise<void>, done: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
      reload();
    }
  };

  const handleLeave = async (event: FormEvent) => {
    event.preventDefault();
    if (!from || !to) {
      setError("Choose the first and last day of your leave.");
      return;
    }
    await run(async () => {
      await requestLeave(supabase, from, to, reason);
      setFrom("");
      setTo("");
      setReason("");
    }, "Your leave request was sent to the admin.");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (notEmployee || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#fafafa] px-6">
        <p className="max-w-sm text-center text-sm whitespace-pre-wrap text-destructive">
          {error ?? "This login is not an active employee account. Ask the admin."}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>
    );
  }

  const { employee, attendance, leaves, today, location } = data;
  const todayRow = attendance.find((row) => row.work_date === today) ?? null;
  const canCheckIn = !todayRow;
  const canCheckOut = Boolean(todayRow && !todayRow.check_out);
  const locationOn = Boolean(location?.enabled);

  const doCheckIn = async () => {
    await run(async () => {
      if (locationOn) {
        const position = await getPhonePosition();
        await checkIn(supabase, position);
      } else {
        // Still send the phone position when we can, so the admin can see it later.
        try {
          const position = await getPhonePosition();
          await checkIn(supabase, position);
        } catch {
          await checkIn(supabase, null);
        }
      }
    }, "You are checked in.");
  };

  return (
    <div className="min-h-screen bg-[#fafafa] pb-10">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{employee.name}</p>
            <p className="text-xs text-muted-foreground">{periodLabel(today, "day", true)}</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-5">
        {message ? (
          <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
            {error}
          </p>
        ) : null}

        {/* ---------- Attendance ---------- */}
        <section className="rounded-xl border border-border bg-white p-4">
          <h2 className="text-sm font-semibold">Today</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {!todayRow
              ? "You have not checked in yet."
              : todayRow.check_out
                ? `Checked in ${formatClock(todayRow.check_in)}, checked out ${formatClock(todayRow.check_out)} (${formatHours(hoursWorked(todayRow))}).`
                : `Checked in at ${formatClock(todayRow.check_in)}.`}
          </p>
          {canCheckIn && locationOn ? (
            <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Check-in only works within about {location?.radius_m ?? 50} m of the shop. Your phone will ask for
              location when you tap the button.
            </p>
          ) : null}
          {canCheckOut && todayRow ? (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-600" />
              </span>
              <div>
                <p className="text-xs text-emerald-900/70">Time at work today</p>
                <LiveElapsed
                  since={todayRow.check_in}
                  stopwatch
                  className="text-2xl font-semibold tracking-tight text-emerald-900"
                />
              </div>
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button
              type="button"
              size="lg"
              disabled={busy || !canCheckIn}
              onClick={() => void doCheckIn()}
            >
              <LogIn className="size-4" />
              Check in
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={busy || !canCheckOut}
              onClick={() => run(() => checkOut(supabase), "You are checked out.")}
            >
              <LogOut className="size-4" />
              Check out
            </Button>
          </div>
        </section>

        <MyTargetCard />

        <section className="rounded-xl border border-border bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">This month</h2>
          {attendance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance yet this month.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1 font-medium">Date</th>
                  <th className="pb-1 font-medium">In</th>
                  <th className="pb-1 font-medium">Out</th>
                  <th className="pb-1 text-right font-medium">Hours</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-1.5">{periodLabel(row.work_date, "day")}</td>
                    <td className="py-1.5 tabular-nums">{formatClock(row.check_in)}</td>
                    <td className="py-1.5 tabular-nums">
                      {row.check_out ? formatClock(row.check_out) : row.work_date === today ? "—" : "missed"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{formatHours(hoursWorked(row))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {attendance.length} day{attendance.length === 1 ? "" : "s"} present this month.
          </p>
        </section>

        {/* ---------- Leave ---------- */}
        <section className="rounded-xl border border-border bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">Ask for leave</h2>
          <form onSubmit={handleLeave} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                First day
                <Input
                  type="date"
                  value={from}
                  min={today}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    if (!to || to < event.target.value) setTo(event.target.value);
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Last day
                <Input type="date" value={to} min={from || today} onChange={(event) => setTo(event.target.value)} />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Reason
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder="Why do you need leave?"
              />
            </label>
            <Button type="submit" disabled={busy}>
              Send request
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">My leave requests</h2>
          {leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have not asked for leave yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {leaves.map((item) => (
                <li key={item.id} className="border-t border-border/60 pt-3 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{leaveDates(item)}</p>
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
                  </div>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted-foreground">{item.reason}</p>
                  {item.admin_note ? (
                    <p className="mt-0.5 text-sm">
                      <span className="text-muted-foreground">Admin: </span>
                      {item.admin_note}
                    </p>
                  ) : null}
                  {item.status === "pending" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={busy}
                      onClick={() => run(() => cancelLeave(supabase, item.id), "Your request was cancelled.")}
                    >
                      Cancel request
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
