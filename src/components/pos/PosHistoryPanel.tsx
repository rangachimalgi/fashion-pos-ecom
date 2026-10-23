"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { listAdminOrders } from "@/lib/adminOrders";
import { formatInr, formatOrderTime, shortOrderId } from "@/lib/formatOrder";
import { buildPosReceiptFromOrder } from "@/lib/posReceipt";
import type { AdminOrder } from "@/types/order";
import type { PosReceipt } from "@/lib/posReceipt";

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function PosHistoryPanel({
  attendedBy,
  onReprint,
}: {
  attendedBy: string;
  onReprint: (receipt: PosReceipt) => void;
}) {
  const [range, setRange] = useState<"month" | "all">("month");
  const [month, setMonth] = useState(currentMonthValue);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthBounds = useMemo(() => {
    if (range !== "month") return {};
    const [year, mon] = month.split("-").map(Number);
    const start = new Date(year || new Date().getFullYear(), (mon || new Date().getMonth() + 1) - 1, 1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [range, month]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listAdminOrders(supabase, { source: "POS", ...monthBounds });
      setOrders(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load POS history");
    } finally {
      setLoading(false);
    }
  }, [monthBounds]);

  useEffect(() => {
    load();
  }, [load]);

  const total = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRange("month")}
          className={`rounded-lg border px-3 py-1.5 text-xs font-black tracking-wider ${
            range === "month"
              ? "border-emerald-400 bg-emerald-600 text-white"
              : "border-slate-600 bg-slate-900 text-slate-400"
          }`}
        >
          MONTHLY
        </button>
        <button
          type="button"
          onClick={() => setRange("all")}
          className={`rounded-lg border px-3 py-1.5 text-xs font-black tracking-wider ${
            range === "all"
              ? "border-emerald-400 bg-emerald-600 text-white"
              : "border-slate-600 bg-slate-900 text-slate-400"
          }`}
        >
          FULL HISTORY
        </button>
        {range === "month" ? (
          <label className="relative inline-flex h-8 items-center">
            <Calendar className="pointer-events-none absolute right-2 size-3.5 text-white" />
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-8 rounded-lg border border-slate-600 bg-slate-900 py-0 pr-8 pl-2 font-sans text-xs text-white scheme-dark [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-8 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
            />
          </label>
        ) : null}
        <p className="ml-auto font-sans text-xs text-slate-400">
          {loading ? "…" : `${orders.length} bills · ${formatInr(total)}`}
        </p>
      </div>

      {error ? <p className="mb-3 font-sans text-xs text-rose-400">{error}</p> : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="font-sans text-sm text-slate-500">Loading POS invoices…</p>
        ) : orders.length === 0 ? (
          <p className="font-sans text-sm text-slate-500">No POS invoices in this range.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-2 font-medium">Bill</th>
                <th className="py-2 font-medium">When</th>
                <th className="py-2 font-medium">Pay</th>
                <th className="py-2 text-right font-medium">Items</th>
                <th className="py-2 text-right font-medium">Net</th>
                <th className="py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-slate-700">
                  <td className="py-3 font-mono text-emerald-300">{shortOrderId(order.id)}</td>
                  <td className="py-3 font-sans text-xs text-slate-300">
                    {formatOrderTime(order.created_at)}
                  </td>
                  <td className="py-3 text-slate-200">{order.payment_method}</td>
                  <td className="py-3 text-right text-slate-300">{order.item_count}</td>
                  <td className="py-3 text-right font-semibold text-emerald-400">
                    {formatInr(order.total_amount)}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onReprint(buildPosReceiptFromOrder(order, attendedBy))}
                      className="rounded-md border border-slate-500 px-2 py-1 text-[11px] font-black tracking-wider text-slate-200 hover:bg-slate-700"
                    >
                      PRINT
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
