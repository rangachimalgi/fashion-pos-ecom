"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  cashValue,
  fetchCashHistory,
  fetchDrawer,
  RECENT_MOVEMENTS_LIMIT,
  setCashDrawer,
  type CashCounts,
  type CashEntry,
  type DrawerRow,
} from "@/lib/cashLedger";

function inr(amount: number) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}₹${Math.abs(amount).toLocaleString("en-IN")}`;
}

function describeDelta(delta: CashCounts) {
  return Object.entries(delta)
    .map(([denomination, count]) => ({ denomination: Number(denomination), count: Number(count) }))
    .sort((a, b) => b.denomination - a.denomination)
    .map(({ denomination, count }) => `${count > 0 ? "+" : "−"}${Math.abs(count)}×₹${denomination}`)
    .join("  ");
}

function entryTitle(entry: CashEntry) {
  const bill = entry.order_ref ? `bill ${entry.order_ref}` : "a bill";
  if (entry.kind === "bill") return `Cash from ${bill}`;
  if (entry.kind === "bill_undo") return `Cash reversed (${bill})`;
  return "Counter edited by admin";
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The cash counter. Shown inside the POS, to admins only (the database also
 * refuses to hand this data to anyone else).
 */
export function CashLedgerPanel() {
  const [drawer, setDrawer] = useState<DrawerRow[]>([]);
  const [history, setHistory] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchDrawer(supabase), fetchCashHistory(supabase)])
      .then(([nextDrawer, nextHistory]) => {
        if (cancelled) return;
        setDrawer(nextDrawer);
        setHistory(nextHistory);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the cash counter");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const total = useMemo(
    () => drawer.reduce((sum, row) => sum + row.denomination * row.quantity, 0),
    [drawer]
  );
  const hasNegative = drawer.some((row) => row.quantity < 0);

  const startEdit = () => {
    setDraft(Object.fromEntries(drawer.map((row) => [String(row.denomination), String(row.quantity)])));
    setNote("");
    setError(null);
    setEditing(true);
  };

  const changed = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of drawer) {
      const raw = draft[String(row.denomination)];
      if (raw === undefined || raw.trim() === "") continue;
      const value = Number(raw);
      if (Number.isInteger(value) && value >= 0 && value !== row.quantity) {
        out[String(row.denomination)] = value;
      }
    }
    return out;
  }, [draft, drawer]);

  const draftInvalid = drawer.some((row) => {
    const raw = draft[String(row.denomination)];
    if (raw === undefined || raw.trim() === "") return true;
    const value = Number(raw);
    return !Number.isInteger(value) || value < 0;
  });

  const draftTotal = drawer.reduce((sum, row) => {
    const value = Number(draft[String(row.denomination)]);
    return sum + row.denomination * (Number.isFinite(value) ? value : 0);
  }, 0);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await setCashDrawer(supabase, changed, note);
      setEditing(false);
      setLoading(true);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto font-sans">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-wider text-slate-400">CASH IN COUNTER</p>
          <p className={`text-4xl font-black ${total < 0 ? "text-rose-400" : "text-emerald-400"}`}>
            {loading ? "…" : inr(total)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Only admins can see or change this. Cash bills update it automatically.
          </p>
        </div>
        {editing ? null : (
          <button
            type="button"
            onClick={startEdit}
            disabled={loading || drawer.length === 0}
            className="rounded-lg border border-slate-500 px-4 py-2 text-xs font-black tracking-wider text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            EDIT COUNTS
          </button>
        )}
      </div>

      {error ? (
        <p className="mb-3 whitespace-pre-wrap rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      {hasNegative ? (
        <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          A note or coin count is below zero, so more was given out as change than the counter was
          recorded as holding. Count the drawer and use EDIT COUNTS to correct it.
        </p>
      ) : null}

      <div className="mb-6 overflow-hidden rounded-lg border border-slate-700">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/50 text-xs text-slate-400">
              <th className="px-3 py-2">NOTE / COIN</th>
              <th className="px-3 py-2 text-right">COUNT</th>
              <th className="px-3 py-2 text-right">VALUE</th>
            </tr>
          </thead>
          <tbody>
            {drawer.map((row) => (
              <tr key={row.denomination} className="border-b border-slate-700/50">
                <td className="px-3 py-2 font-bold text-slate-200">₹{row.denomination}</td>
                <td className="px-3 py-2 text-right">
                  {editing ? (
                    <input
                      type="number"
                      min={0}
                      value={draft[String(row.denomination)] ?? ""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [String(row.denomination)]: event.target.value,
                        }))
                      }
                      className="h-8 w-24 rounded border border-slate-600 bg-slate-900 px-2 text-right text-white outline-none focus:border-emerald-400"
                    />
                  ) : (
                    <span className={row.quantity < 0 ? "font-bold text-rose-400" : "text-slate-200"}>
                      {row.quantity}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                  {inr(row.denomination * row.quantity)}
                </td>
              </tr>
            ))}
            {!loading && drawer.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                  No cash counter found. Run migration 018.
                </td>
              </tr>
            ) : null}
          </tbody>
          {drawer.length > 0 ? (
            <tfoot>
              <tr className="bg-slate-900/50">
                <td className="px-3 py-2 text-xs font-black text-slate-400">TOTAL</td>
                <td />
                <td className="px-3 py-2 text-right font-black text-emerald-300 tabular-nums">
                  {inr(editing ? draftTotal : total)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {editing ? (
        <div className="mb-6 space-y-2 rounded-lg border border-slate-600 bg-slate-900/40 p-3">
          <p className="text-xs text-slate-300">
            Type what you physically counted. The change is logged with your name and the reason below.
            {Object.keys(changed).length > 0
              ? ` Net change: ${inr(
                  cashValue(
                    Object.fromEntries(
                      drawer
                        .filter((row) => String(row.denomination) in changed)
                        .map((row) => [
                          String(row.denomination),
                          changed[String(row.denomination)] - row.quantity,
                        ])
                    )
                  )
                )}.`
              : ""}
          </p>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reason, e.g. Opening count, or Took ₹500 for tea"
            maxLength={200}
            className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={
                saving || draftInvalid || Object.keys(changed).length === 0 || note.trim().length < 3
              }
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-black tracking-wider text-slate-950 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500"
            >
              {saving ? "SAVING…" : "SAVE COUNTS"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-lg border border-slate-600 px-4 py-2 text-xs font-black tracking-wider text-slate-300 hover:bg-slate-700"
            >
              CANCEL
            </button>
          </div>
        </div>
      ) : null}

      <h3 className="mb-2 text-xs font-bold tracking-wider text-slate-400">
        RECENT MOVEMENTS <span className="font-normal text-slate-500">(latest {RECENT_MOVEMENTS_LIMIT})</span>
      </h3>
      <div className="divide-y divide-slate-700/60 overflow-hidden rounded-lg border border-slate-700">
        {history.length === 0 && !loading ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">
            Nothing yet. Set the opening counts, then cash bills will appear here.
          </p>
        ) : (
          history.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-slate-200">{entryTitle(entry)}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {formatWhen(entry.created_at)}
                  {entry.actor_email ? ` · ${entry.actor_email.split("@")[0]}` : ""}
                  {entry.note ? ` · ${entry.note}` : ""}
                </p>
                <p className="text-[11px] text-slate-500">{describeDelta(entry.delta)}</p>
              </div>
              <p
                className={`shrink-0 text-sm font-bold tabular-nums ${
                  entry.amount < 0 ? "text-rose-400" : "text-emerald-300"
                }`}
              >
                {entry.amount > 0 ? "+" : ""}
                {inr(entry.amount)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
