"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Download } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  PRESET_LABELS,
  exportReportPdf,
  exportReportXlsx,
  fetchSalesReport,
  marginPercent,
  monthEnd,
  periodLabel,
  presetRange,
  rangeLabel,
  sumRows,
  todayInShop,
  type ReportFilters,
  type ReportPreset,
  type ReportRow,
  type ReportSource,
} from "@/lib/salesReport";
import { STORE_RECEIPT } from "@/lib/storeReceipt";
import { ReportTabs } from "@/components/admin/ReportTabs";
import { HomeBackLink } from "@/components/admin/home/HomeBackLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const GST_PERCENT = STORE_RECEIPT.cgstRate + STORE_RECEIPT.sgstRate;

function inr(amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded < 0 ? "-" : ""}₹${Math.abs(rounded).toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function percent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

type ReportData = { daily: ReportRow[]; monthly: ReportRow[] };

export default function ReportsPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<ReportPreset>("thisMonth");
  const [from, setFrom] = useState(() => presetRange("thisMonth").from);
  const [to, setTo] = useState(() => presetRange("thisMonth").to);
  const [source, setSource] = useState<ReportSource>("ALL");
  const [splitGst, setSplitGst] = useState(true);
  const [tab, setTab] = useState<"day" | "month">("day");

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const rangeInvalid = Boolean(from && to && from > to);
  const gstPercent = splitGst ? GST_PERCENT : 0;
  const filters: ReportFilters = useMemo(
    () => ({ from, to, source, gstPercent }),
    [from, to, source, gstPercent]
  );

  useEffect(() => {
    if (rangeInvalid) return;
    let cancelled = false;
    Promise.all([
      fetchSalesReport(supabase, filters, "day"),
      fetchSalesReport(supabase, filters, "month"),
    ])
      .then(([daily, monthly]) => {
        if (cancelled) return;
        setData({ daily, monthly });
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the report");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, rangeInvalid]);

  const rows = useMemo(() => (tab === "day" ? data?.daily : data?.monthly) ?? [], [data, tab]);
  const totals = useMemo(() => sumRows(data?.daily ?? []), [data]);
  const margin = marginPercent(totals);

  const choosePreset = (id: Exclude<ReportPreset, "custom">) => {
    const next = presetRange(id);
    setLoading(true);
    setPreset(id);
    setFrom(next.from);
    setTo(next.to);
  };

  const changeDate = (which: "from" | "to", value: string) => {
    setLoading(true);
    setPreset("custom");
    if (which === "from") setFrom(value);
    else setTo(value);
  };

  const billsHref = (row: ReportRow) => {
    const from = row.period.slice(0, 10);
    const to = tab === "month" ? monthEnd(from) : from;
    const params = new URLSearchParams({
      from,
      to,
      fromReport: "1",
    });
    if (source !== "ALL") params.set("source", source);
    return `/admin/orders?${params.toString()}`;
  };

  const handleExport = async (kind: "xlsx" | "pdf") => {
    const exportRows = tab === "day" ? data?.daily : data?.monthly;
    if (!exportRows?.length || exporting) return;
    setExporting(kind);
    try {
      const args = { rows: exportRows, bucket: tab, filters };
      if (kind === "xlsx") await exportReportXlsx(args);
      else await exportReportPdf(args);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : kind === "xlsx"
            ? "Could not create the Excel file"
            : "Could not create the PDF"
      );
    } finally {
      setExporting(null);
    }
  };

  const salesLabel = splitGst ? "Net sales (excl. GST)" : "Sales";
  const cards = [
    { label: splitGst ? "Sales incl. GST" : "Total sales", value: inr(totals.gross) },
    ...(splitGst
      ? [
          { label: "GST collected", value: inr(totals.gst), muted: true },
          { label: salesLabel, value: inr(totals.net) },
        ]
      : []),
    { label: "Cost of goods", value: inr(totals.cost) },
    {
      label: "Profit",
      value: inr(totals.profit),
      strong: true,
      sub: margin === null ? undefined : `${percent(margin)} margin`,
    },
    { label: "Bills", value: totals.bills.toLocaleString("en-IN") },
    {
      label: "Avg bill",
      value: totals.bills > 0 ? inr(totals.gross / totals.bills) : "—",
    },
    { label: "Pieces sold", value: totals.pieces.toLocaleString("en-IN") },
  ];

  const chartRows = tab === "day" ? rows.slice(-62) : rows.slice(-24);
  const chartMax = Math.max(1, ...chartRows.map((row) => Math.abs(row.profit)));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 md:px-6">
      <HomeBackLink />
      <ReportTabs active="sales" />

      {/* ---------- Filters ---------- */}
      <section className="rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap gap-1.5">
          {PRESET_LABELS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={preset === item.id ? "default" : "outline"}
              onClick={() => choosePreset(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <Input
              type="date"
              value={from}
              max={to || todayInShop()}
              onChange={(event) => changeDate("from", event.target.value)}
              className="h-8 w-40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <Input
              type="date"
              value={to}
              min={from || undefined}
              max={todayInShop()}
              onChange={(event) => changeDate("to", event.target.value)}
              className="h-8 w-40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Channel
            <select
              value={source}
              onChange={(event) => {
                setLoading(true);
                setSource(event.target.value as ReportSource);
              }}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
            >
              <option value="ALL">POS and online</option>
              <option value="POS">POS only</option>
              <option value="ONLINE">Online only</option>
            </select>
          </label>
          <label className="flex h-8 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={splitGst}
              onChange={(event) => {
                setLoading(true);
                setSplitGst(event.target.checked);
              }}
              className="size-4"
            />
            Take out {GST_PERCENT}% GST
          </label>
        </div>

        {rangeInvalid ? (
          <p className="mt-3 text-sm text-destructive">The start date is after the end date.</p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeLabel(from, to)}</span>. Deleted
            bills are not counted. Days run midnight to midnight, India time.
          </p>
        )}
      </section>

      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      {/* ---------- Totals ---------- */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={cn(
              "rounded-xl border border-border bg-white px-4 py-3",
              card.strong && "border-foreground/30 bg-muted/40"
            )}
          >
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p
              className={cn(
                "text-xl font-semibold tracking-tight tabular-nums",
                card.muted && "text-muted-foreground"
              )}
            >
              {loading ? "…" : card.value}
            </p>
            {card.sub && !loading ? <p className="text-xs text-muted-foreground">{card.sub}</p> : null}
          </div>
        ))}
      </section>

      {!loading && totals.netWithoutCost > 0.005 ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {inr(totals.netWithoutCost)} of sales are for products with no cost price, so they are left out
          of profit. Add the cost price to those products to see the true profit.
        </p>
      ) : null}

      {/* ---------- Daily / monthly ---------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={tab === "day" ? "default" : "outline"}
            onClick={() => setTab("day")}
          >
            Daily
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "month" ? "default" : "outline"}
            onClick={() => setTab("month")}
          >
            Monthly
          </Button>

          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                loading ||
                exporting !== null ||
                rangeInvalid ||
                !(tab === "day" ? data?.daily.length : data?.monthly.length)
              }
              onClick={() => handleExport("xlsx")}
            >
              <Download className="size-4" />
              {exporting === "xlsx" ? "Making Excel…" : "Export Excel"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                loading ||
                exporting !== null ||
                rangeInvalid ||
                !(tab === "day" ? data?.daily.length : data?.monthly.length)
              }
              onClick={() => handleExport("pdf")}
            >
              <Download className="size-4" />
              {exporting === "pdf" ? "Making PDF…" : "Export PDF"}
            </Button>
          </div>
        </div>

        {chartRows.length > 1 && !loading ? (
          <div className="mb-3 rounded-xl border border-border bg-white p-4">
            <p className="mb-2 text-xs text-muted-foreground">
              Profit per {tab === "day" ? "day" : "month"} (only {tab === "day" ? "days" : "months"} with
              sales
              {tab === "day" && rows.length > 62 ? ", latest 62" : ""})
            </p>
            <div className="flex h-24 items-end gap-0.5">
              {chartRows.map((row) => {
                const height = Math.max(2, (Math.abs(row.profit) / chartMax) * 96);
                return (
                  <div
                    key={row.period}
                    title={`${periodLabel(row.period, tab, true)}: profit ${inr(row.profit)}, sales ${inr(row.gross)}`}
                    className={cn("min-w-1 flex-1 rounded-t-sm", row.profit < 0 ? "bg-destructive" : "bg-foreground")}
                    style={{ height }}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{periodLabel(chartRows[0].period, tab)}</span>
              <span>{periodLabel(chartRows[chartRows.length - 1].period, tab)}</span>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tab === "day" ? "Date" : "Month"}</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="text-right">Pieces</TableHead>
                <TableHead className="text-right">{splitGst ? "Sales incl. GST" : "Sales"}</TableHead>
                {splitGst ? <TableHead className="text-right">Net sales</TableHead> : null}
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="w-8" aria-hidden />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={splitGst ? 9 : 8} className="py-6 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={splitGst ? 9 : 8} className="py-6 text-center text-muted-foreground">
                    No sales in this period.
                  </TableCell>
                </TableRow>
              ) : (
                [...rows].reverse().map((row) => (
                  <TableRow
                    key={row.period}
                    tabIndex={0}
                    onClick={() => router.push(billsHref(row))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") router.push(billsHref(row));
                    }}
                    className="group cursor-pointer outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
                  >
                    <TableCell className="font-medium whitespace-nowrap group-hover:underline">
                      {periodLabel(row.period, tab, true)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.bills}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.pieces}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(row.gross)}</TableCell>
                    {splitGst ? (
                      <TableCell className="text-right tabular-nums">{inr(row.net)}</TableCell>
                    ) : null}
                    <TableCell className="text-right tabular-nums">{inr(row.cost)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold tabular-nums",
                        row.profit < 0 && "text-destructive"
                      )}
                    >
                      {inr(row.profit)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {percent(marginPercent(row))}
                    </TableCell>
                    <TableCell className="pr-3 text-right">
                      <ChevronRight className="inline size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {!loading && rows.length > 0 ? (
              <TableFooter>
                {(() => {
                  const sum = sumRows(rows);
                  return (
                    <TableRow>
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{sum.bills}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{sum.pieces}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{inr(sum.gross)}</TableCell>
                      {splitGst ? (
                        <TableCell className="text-right font-semibold tabular-nums">{inr(sum.net)}</TableCell>
                      ) : null}
                      <TableCell className="text-right font-semibold tabular-nums">{inr(sum.cost)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{inr(sum.profit)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {percent(marginPercent(sum))}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  );
                })()}
              </TableFooter>
            ) : null}
          </Table>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Click a {tab === "day" ? "day" : "month"} to open its bills, then open a bill for the full order.
          Profit = sales{splitGst ? " (without GST)" : ""} minus the cost price recorded when each piece was
          sold, so later changes to a cost price do not change old profit. Bills made before this report
          existed use the cost price as it was when the report was set up.
        </p>
      </section>
    </div>
  );
}
