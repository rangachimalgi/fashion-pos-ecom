"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  LEAVE_STATUS_LABEL,
  decideLeave,
  inclusiveDays,
  listLeaveRequests,
  type LeaveStatus,
  type LeaveWithEmployee,
} from "@/lib/attendance";
import { periodLabel } from "@/lib/salesReport";
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

function dates(item: { from_date: string; to_date: string }) {
  const days = inclusiveDays(item.from_date, item.to_date);
  const label =
    item.from_date === item.to_date
      ? periodLabel(item.from_date, "day")
      : `${periodLabel(item.from_date, "day")} to ${periodLabel(item.to_date, "day")}`;
  return `${label} (${days} day${days === 1 ? "" : "s"})`;
}

function StatusBadge({ status }: { status: LeaveStatus }) {
  const variant =
    status === "approved" ? "default" : status === "rejected" ? "destructive" : status === "pending" ? "secondary" : "outline";
  return <Badge variant={variant}>{LEAVE_STATUS_LABEL[status]}</Badge>;
}

export default function LeaveRequestsPage() {
  const [items, setItems] = useState<LeaveWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Exclude<LeaveStatus, "pending">>("all");

  useEffect(() => {
    let cancelled = false;
    listLeaveRequests(supabase)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load leave requests");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const pending = useMemo(
    () => items.filter((item) => item.status === "pending").sort((a, b) => a.from_date.localeCompare(b.from_date)),
    [items]
  );
  const decided = useMemo(
    () => items.filter((item) => item.status !== "pending" && (filter === "all" || item.status === filter)),
    [items, filter]
  );

  const decide = async (item: LeaveWithEmployee, approve: boolean) => {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      await decideLeave(supabase, item.id, approve, notes[item.id] ?? "");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the decision");
      reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Waiting for your decision {loading ? "" : `(${pending.length})`}
        </h2>
        {loading ? (
          <p className="rounded-xl border border-border bg-white px-4 py-6 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : pending.length === 0 ? (
          <p className="rounded-xl border border-border bg-white px-4 py-6 text-center text-sm text-muted-foreground">
            No leave requests are waiting.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-white p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="font-medium">{item.employee_name}</p>
                  <p className="text-sm text-muted-foreground">{dates(item)}</p>
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap">{item.reason}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Note to the employee (optional)"
                    value={notes[item.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                    maxLength={300}
                    className="h-8 max-w-xs"
                  />
                  <Button type="button" size="sm" disabled={busyId !== null} onClick={() => decide(item, true)}>
                    <Check className="size-4" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={busyId !== null}
                    onClick={() => decide(item, false)}
                  >
                    <X className="size-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">History</h2>
          <div className="ml-auto flex gap-1.5">
            {(["all", "approved", "rejected", "cancelled"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "All" : LEAVE_STATUS_LABEL[value]}
              </Button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Your note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {decided.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    {loading ? "Loading…" : "Nothing here yet."}
                  </TableCell>
                </TableRow>
              ) : (
                decided.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium whitespace-nowrap">{item.employee_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{dates(item)}</TableCell>
                    <TableCell className="max-w-64 truncate" title={item.reason}>
                      {item.reason}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground" title={item.admin_note ?? ""}>
                      {item.admin_note ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
