"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  addSalesPerson,
  deleteSalesPerson,
  listSalesPeople,
  renameSalesPerson,
  salesByPerson,
  setSalesPersonActive,
  type SalesPerson,
  type SalesRow,
} from "@/lib/salesPeople";
import { formatInr } from "@/lib/formatOrder";
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

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(value: string) {
  const [year, month] = value.split("-").map(Number);
  const start = new Date(year, (month || 1) - 1, 1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export default function SalesTeamPage() {
  const [people, setPeople] = useState<SalesPerson[]>([]);
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [range, setRange] = useState<"month" | "all">("month");
  const [month, setMonth] = useState(currentMonthValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listSalesPeople(supabase),
      salesByPerson(supabase, range === "month" ? monthBounds(month) : undefined),
    ])
      .then(([nextPeople, nextRows]) => {
        if (cancelled) return;
        setPeople(nextPeople);
        setRows(nextRows);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the sales team");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, month, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    if (newName.trim().length < 2) {
      setError("A name needs at least 2 characters.");
      return;
    }
    run(async () => {
      await addSalesPerson(supabase, newName);
      setNewName("");
    });
  };

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.total_amount - a.total_amount || a.name.localeCompare(b.name)),
    [rows]
  );
  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          bills: sum.bills + row.bills,
          pieces: sum.pieces + row.pieces,
          amount: sum.amount + row.total_amount,
        }),
        { bills: 0, pieces: 0, amount: 0 }
      ),
    [rows]
  );
  const topAmount = sorted[0]?.total_amount ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-6 md:px-6">
      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      {/* ---------- Sales per person ---------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Sales by salesperson</h2>
            <p className="text-sm text-muted-foreground">
              POS bills only. Deleted bills are not counted.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={range === "month" ? "default" : "outline"}
              onClick={() => {
                setLoading(true);
                setRange("month");
              }}
            >
              Month
            </Button>
            <Button
              type="button"
              size="sm"
              variant={range === "all" ? "default" : "outline"}
              onClick={() => {
                setLoading(true);
                setRange("all");
              }}
            >
              All time
            </Button>
            {range === "month" ? (
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
            ) : null}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-3">
          {[
            { label: "Total sales", value: formatInr(totals.amount) },
            { label: "Bills", value: totals.bills.toLocaleString("en-IN") },
            { label: "Pieces sold", value: totals.pieces.toLocaleString("en-IN") },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-white px-4 py-3">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-xl font-semibold tracking-tight">{loading ? "…" : card.value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Salesperson</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="text-right">Pieces</TableHead>
                <TableHead className="text-right">Avg bill</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="w-28 text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Add your salespeople below, then pick one on each bill at the POS.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row) => {
                  const share = totals.amount > 0 ? (row.total_amount / totals.amount) * 100 : 0;
                  return (
                    <TableRow key={row.sales_person_id ?? "unassigned"}>
                      <TableCell className="font-medium">
                        {row.name}
                        {row.sales_person_id === null ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            no one picked
                          </span>
                        ) : !row.active ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">inactive</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.bills}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.pieces}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.bills > 0 ? formatInr(Math.round(row.total_amount / row.bills)) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatInr(row.total_amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-foreground"
                              style={{ width: `${topAmount > 0 ? (row.total_amount / topAmount) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                            {share.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ---------- The team ---------- */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Sales team</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          These names appear in the “Attended by” list at the POS. Deactivate someone who has left:
          their past bills stay, but they can’t be picked for new ones.
        </p>

        <form onSubmit={handleAdd} className="mb-3 flex gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Add a salesperson, e.g. Ravi"
            maxLength={60}
            className="max-w-xs"
          />
          <Button type="submit" disabled={busy || newName.trim().length < 2}>
            Add
          </Button>
        </form>

        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
          {people.length === 0 && !loading ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No salespeople yet.</p>
          ) : (
            people.map((person) => (
              <div key={person.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                {editingId === person.id ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(async () => {
                        await renameSalesPerson(supabase, person.id, editName);
                        setEditingId(null);
                      });
                    }}
                  >
                    <Input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      maxLength={60}
                      autoFocus
                      className="h-8 max-w-xs"
                    />
                    <Button type="submit" size="sm" disabled={busy || editName.trim().length < 2}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className={person.active ? "font-medium" : "text-muted-foreground"}>
                      {person.name}
                    </span>
                    <Badge variant={person.active ? "secondary" : "outline"}>
                      {person.active ? "Active" : "Inactive"}
                    </Badge>
                    <div className="ml-auto flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(person.id);
                          setEditName(person.name);
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => run(() => setSalesPersonActive(supabase, person.id, !person.active))}
                      >
                        {person.active ? "Deactivate" : "Reactivate"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Delete ${person.name}? This only works if they have no bills.`)) {
                            run(() => deleteSalesPerson(supabase, person.id));
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
