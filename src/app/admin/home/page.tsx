"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChartColumn,
  ChevronRight,
  ClipboardList,
  Percent,
  Receipt,
  ShoppingBag,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchSalesReport,
  presetRange,
  sumRows,
  todayInShop,
} from "@/lib/salesReport";
import { formatInr } from "@/lib/formatOrder";
import { cn } from "@/lib/utils";

type Snapshot = {
  todaySales: number;
  todayBills: number;
  monthSales: number;
  monthBills: number;
};

type Tile = {
  href: string;
  title: string;
  description: string;
  icon: typeof ChartColumn;
};

const REPORT_TILES: Tile[] = [
  {
    href: "/admin/reports",
    title: "Sales & profit",
    description: "Day and month sales, with GST split if you want",
    icon: ChartColumn,
  },
  {
    href: "/admin/reports/margin",
    title: "Item margin",
    description: "Profit per style / barcode sold",
    icon: Percent,
  },
  {
    href: "/admin/reports/purchases",
    title: "Purchases",
    description: "What you bought from suppliers",
    icon: ClipboardList,
  },
  {
    href: "/admin/reports/gst",
    title: "GST",
    description: "Tax summary for filing",
    icon: Receipt,
  },
];

export default function HomePage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const today = todayInShop();
    const month = presetRange("thisMonth");

    Promise.all([
      fetchSalesReport(supabase, { from: today, to: today, source: "ALL", gstPercent: 0 }, "day"),
      fetchSalesReport(supabase, { from: month.from, to: month.to, source: "ALL", gstPercent: 0 }, "day"),
    ])
      .then(([todayRows, monthRows]) => {
        if (cancelled) return;
        const t = sumRows(todayRows);
        const m = sumRows(monthRows);
        setData({
          todaySales: t.gross,
          todayBills: t.bills,
          monthSales: m.gross,
          monthBills: m.bills,
        });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        // Home still works without the snapshot numbers.
        setData({ todaySales: 0, todayBills: 0, monthSales: 0, monthBills: 0 });
        setError(err instanceof Error ? err.message : "Could not load today’s figures");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Home</h2>
      </div>

      {error ? (
        <p className="rounded-xl border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
          Snapshot unavailable right now. Reports below still work.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Today", value: data ? formatInr(Math.round(data.todaySales)) : "…", hint: data ? `${data.todayBills} bills` : undefined },
          { label: "This month", value: data ? formatInr(Math.round(data.monthSales)) : "…", hint: data ? `${data.monthBills} bills` : undefined },
          {
            label: "Orders",
            value: "Open",
            hint: "POS + online",
            href: "/admin/orders",
          },
          {
            label: "Team",
            value: "Open",
            hint: "People & attendance",
            href: "/admin/team",
          },
        ].map((card) => {
          const inner = (
            <>
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{card.value}</p>
              {card.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{card.hint}</p> : null}
            </>
          );
          return card.href ? (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-xl border border-border bg-white px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-muted/30"
            >
              {inner}
            </Link>
          ) : (
            <div key={card.label} className="rounded-xl border border-border bg-white px-4 py-3">
              {inner}
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Reports</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {REPORT_TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.href}
                href={tile.href}
                className="group flex items-start gap-3 rounded-xl border border-border bg-white p-4 transition-colors hover:border-foreground/20 hover:bg-muted/30"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{tile.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{tile.description}</p>
                </div>
                <ChevronRight
                  className={cn(
                    "mt-1 size-4 shrink-0 text-muted-foreground/50 transition-transform",
                    "group-hover:translate-x-0.5 group-hover:text-foreground"
                  )}
                />
              </Link>
            );
          })}
        </div>
      </div>

      {/* <Link
        href="/billing"
        className="inline-flex items-center gap-2 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ShoppingBag className="size-4" />
        Open POS
      </Link>` */}
    </div>
  );
}
