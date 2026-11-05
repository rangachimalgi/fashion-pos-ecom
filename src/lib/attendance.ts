import type { SupabaseClient } from "@supabase/supabase-js";
import { SHOP_TIMEZONE } from "@/lib/salesReport";

// ---------------------------------------------------------------------------
// Attendance and leave. Reads/writes go through supabase/migrations/025:
// employees use the check-in / leave functions (times come from the database),
// admins read everything and approve or reject leave.
// ---------------------------------------------------------------------------

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type AttendanceRow = {
  id: string;
  employee_id: string;
  /** Shop day, YYYY-MM-DD. */
  work_date: string;
  check_in: string;
  check_out: string | null;
};

export type LeaveRequest = {
  id: string;
  employee_id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: LeaveStatus;
  admin_note: string | null;
  decided_by_email: string | null;
  decided_at: string | null;
  created_at: string;
};

export type LeaveWithEmployee = LeaveRequest & { employee_name: string; employee_phone: string };

export type MyEmployee = { id: string; name: string; phone: string };

function friendly(error: { code?: string; message: string }): Error {
  if (
    error.code === "PGRST202" ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the function/i.test(error.message)
  ) {
    return new Error("Employees are not set up yet. Run supabase/migrations/024 and 025 in the SQL Editor.");
  }
  return new Error(error.message);
}

const PAGE = 1000;

async function fetchAll(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { code?: string; message: string } | null }>
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (let index = 0; index < 100; index += 1) {
    const { data, error } = await page(index * PAGE, index * PAGE + PAGE - 1);
    if (error) throw friendly(error);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Display helpers (always the shop's time zone)
// ---------------------------------------------------------------------------

export function formatClock(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: SHOP_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .toUpperCase();
}

export function hoursWorked(row: Pick<AttendanceRow, "check_in" | "check_out">): number | null {
  if (!row.check_out) return null;
  const ms = new Date(row.check_out).getTime() - new Date(row.check_in).getTime();
  return ms >= 0 ? ms / 3_600_000 : null;
}

/** 7.5 -> "7h 30m". */
export function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Days from `from` to `to`, both included (YYYY-MM-DD). */
export function inclusiveDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

// ---------------------------------------------------------------------------
// Employee side
// ---------------------------------------------------------------------------

/** The signed-in employee, or null when this login is not an active employee. */
export async function myEmployee(supabase: SupabaseClient): Promise<MyEmployee | null> {
  const { data, error } = await supabase.rpc("my_employee");
  if (error) throw friendly(error);
  const row = ((data ?? []) as MyEmployee[])[0];
  return row ? { id: String(row.id), name: String(row.name), phone: String(row.phone) } : null;
}

export async function checkIn(supabase: SupabaseClient) {
  const { error } = await supabase.rpc("employee_check_in");
  if (error) throw friendly(error);
}

export async function checkOut(supabase: SupabaseClient) {
  const { error } = await supabase.rpc("employee_check_out");
  if (error) throw friendly(error);
}

function toAttendance(row: Record<string, unknown>): AttendanceRow {
  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    work_date: String(row.work_date),
    check_in: String(row.check_in),
    check_out: (row.check_out as string | null) ?? null,
  };
}

/** An employee sees only their own rows (the database enforces it). */
export async function myAttendance(supabase: SupabaseClient, from: string, to: string): Promise<AttendanceRow[]> {
  const { data, error } = await supabase
    .from("attendance")
    .select("id, employee_id, work_date, check_in, check_out")
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date", { ascending: false });
  if (error) throw friendly(error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(toAttendance);
}

function toLeave(row: Record<string, unknown>): LeaveRequest {
  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    from_date: String(row.from_date),
    to_date: String(row.to_date),
    reason: String(row.reason),
    status: String(row.status) as LeaveStatus,
    admin_note: (row.admin_note as string | null) ?? null,
    decided_by_email: (row.decided_by_email as string | null) ?? null,
    decided_at: (row.decided_at as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

export async function myLeaves(supabase: SupabaseClient): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw friendly(error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(toLeave);
}

export async function requestLeave(supabase: SupabaseClient, from: string, to: string, reason: string) {
  const { error } = await supabase.rpc("request_leave", {
    p_from: from,
    p_to: to,
    p_reason: reason,
  });
  if (error) throw friendly(error);
}

export async function cancelLeave(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.rpc("cancel_leave", { p_id: id });
  if (error) throw friendly(error);
}

// ---------------------------------------------------------------------------
// Admin side
// ---------------------------------------------------------------------------

/** Every employee's attendance between two days (inclusive). */
export async function attendanceBetween(supabase: SupabaseClient, from: string, to: string): Promise<AttendanceRow[]> {
  const rows = await fetchAll((start, end) =>
    supabase
      .from("attendance")
      .select("id, employee_id, work_date, check_in, check_out")
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end)
  );
  return rows.map(toAttendance);
}

/** Approved leave that touches any day between `from` and `to`. */
export async function approvedLeaveBetween(supabase: SupabaseClient, from: string, to: string): Promise<LeaveRequest[]> {
  const rows = await fetchAll((start, end) =>
    supabase
      .from("leave_requests")
      .select("*")
      .eq("status", "approved")
      .lte("from_date", to)
      .gte("to_date", from)
      .order("id", { ascending: true })
      .range(start, end)
  );
  return rows.map(toLeave);
}

export async function listLeaveRequests(supabase: SupabaseClient): Promise<LeaveWithEmployee[]> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*, employees(name, phone)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw friendly(error);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const joined = row.employees as { name?: string; phone?: string } | { name?: string; phone?: string }[] | null;
    const employee = Array.isArray(joined) ? joined[0] : joined;
    return {
      ...toLeave(row),
      employee_name: employee?.name ?? "—",
      employee_phone: employee?.phone ?? "",
    };
  });
}

export async function decideLeave(supabase: SupabaseClient, id: string, approve: boolean, note: string) {
  const { error } = await supabase.rpc("decide_leave", {
    p_id: id,
    p_approve: approve,
    p_note: note.trim() || null,
  });
  if (error) throw friendly(error);
}

export async function countPendingLeaves(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}
