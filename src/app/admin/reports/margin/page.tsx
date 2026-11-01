"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  buildMarginTable,
  computeRows,
  exportMarginPdf,
  exportMarginXlsx,
  fetchMarginLines,
  totalsOf,
  type MarginFilters,
  type MarginLine,
} from "@/lib/marginReport";
import type { CellKind } from "@/lib/purchaseReport";
import {
  PRESET_LABELS,
  presetRange,
  rangeLabel,
  todayInShop,
  type ReportPreset,
  type ReportSource,
} from "@/lib/salesReport";
import { STORE_RECEIPT } from "@/lib/storeReceipt";
import { ReportTabs } from "@/components/admin/ReportTabs";
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

/** The screen shows the first rows; the totals, Excel and PDF use every row. */
const SCREEN_ROW_LIMIT = 300;

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

function money2(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function show(cell: string | number, kind: CellKind) {
  if (typeof cell === "string") return cell;
  if (kind === "money") return money2(cell);
  if (kind === "pct") return `${cell.toFixed(2)}%`;
  return cell.toLocaleString("en-IN");
}

export default function MarginReportPage() {
  const [preset, setPreset] = useState<ReportPreset>("thisMonth");
  const [from, setFrom] = useState(() => presetRange("thisMonth").from);
  const [to, setTo] = useState(() => presetRange("thisMonth").to);
  const [source, setSource] = useState<ReportSource>("ALL");
  const [splitGst, setSplitGst] = useState(true);

  const [lines, setLines] = useState<MarginLine[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const rangeInvalid = Boolean(from && to && from > to);
  const gstPercent = splitGst ? GST_PERCENT : 0;
  const filters: MarginFilters = useMemo(() => ({ from, to, source }), [from, to, source]);

  useEffect(() => {
    if (rangeInvalid) return;
    let cancelled = false;
    fetchMarginLines(supabase, filters)
      .then((result) => {
        if (cancelled) return;
        setLines(result);
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

  const rows = useMemo(() => computeRows(lines ?? [], gstPercent), [lines, gstPercent]);
  const totals = useMemo(() => totalsOf(rows), [rows]);
  const table = useMemo(() => buildMarginTable(rows, splitGst), [rows, splitGst]);
  const shownRows = table.rows.slice(0, SCREEN_ROW_LIMIT);

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

  const handleExport = async (kind: "xlsx" | "pdf") => {
    if (exporting || !rows.length) return;
    setExporting(kind);
    try {
      const args = { rows, filters, gstPercent };
      if (kind === "xlsx") await exportMarginXlsx(args);
      else await exportMarginPdf(args);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the file");
    } finally {
      setExporting(null);
    }
  };

  const cards = [
    { label: "Sale value (MRP)", value: inr(totals.saleValue) },
    { label: "Item discount", value: inr(totals.itemDisc) },
    { label: splitGst ? "Net value (excl. GST)" : "Paid by customers", value: inr(totals.net) },
    { label: "Cost value", value: inr(totals.cost) },
    { label: "Margin", value: inr(totals.margin), strong: true, sub: `${percent(totals.onCost)} on cost` },
    { label: "Margin % of sales", value: percent(totals.onSales) },
    { label: "Bills", value: totals.bills.toLocaleString("en-IN") },
    { label: "Pieces sold", value: totals.pieces.toLocaleString("en-IN") },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-6">
      <ReportTabs active="margin" />

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
              onChange={(event) => setSplitGst(event.target.checked)}
              className="size-4"
            />
            Take out {GST_PERCENT}% GST
          </label>
        </div>

        {rangeInvalid ? (
          <p className="mt-3 text-sm text-destructive">The start date is after the end date.</p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeLabel(from, to)}</span>. One row
            per item on each bill. Deleted bills are not counted.
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
            <p className="text-xl font-semibold tracking-tight tabular-nums">
              {loading ? "…" : card.value}
            </p>
            {card.sub && !loading ? <p className="text-xs text-muted-foreground">{card.sub}</p> : null}
          </div>
        ))}
      </section>

      {!loading && totals.netWithoutCost > 0.005 ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {inr(totals.netWithoutCost)} of sales are for items with no cost price, so they show no margin
          and are left out of the totals above.
        </p>
      ) : null}

      {/* ---------- Item-wise table ---------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading || Boolean(exporting) || rangeInvalid || !rows.length}
            onClick={() => handleExport("xlsx")}
          >
            <Download className="size-4" />
            {exporting === "xlsx" ? "Making Excel…" : "Export Excel"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading || Boolean(exporting) || rangeInvalid || !rows.length}
            onClick={() => handleExport("pdf")}
          >
            <FileText className="size-4" />
            {exporting === "pdf" ? "Making PDF…" : "Export PDF"}
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                {table.cols.map((col) => (
                  <TableHead
                    key={col.header}
                    className={cn("whitespace-nowrap", col.kind !== "text" && "text-right")}
                  >
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={table.cols.length} className="py-6 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : shownRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={table.cols.length} className="py-6 text-center text-muted-foreground">
                    No sales in this period.
                  </TableCell>
                </TableRow>
              ) : (
                shownRows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell, index) => (
                      <TableCell
                        key={index}
                        className={cn(
                          "whitespace-nowrap",
                          table.cols[index].kind !== "text" && "text-right tabular-nums",
                          index === 3 && "font-medium",
                          index === 10 && typeof cell === "number" && cell < 0 && "text-destructive"
                        )}
                      >
                        {show(cell, table.cols[index].kind)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
            {!loading && table.foot && shownRows.length > 0 ? (
              <TableFooter>
                <TableRow>
                  {table.foot.map((cell, index) => (
                    <TableCell
                      key={index}
                      className={cn(
                        "font-semibold whitespace-nowrap",
                        table.cols[index].kind !== "text" && "text-right tabular-nums"
                      )}
                    >
                      {show(cell, table.cols[index].kind)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </div>

        {table.rows.length > SCREEN_ROW_LIMIT && !loading ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing the first {SCREEN_ROW_LIMIT} of {table.rows.length.toLocaleString("en-IN")} rows. The
            totals row counts all of them, and the Excel and PDF files have every row.
          </p>
        ) : null}

        <p className="mt-3 text-xs text-muted-foreground">
          Sale value is the MRP times quantity, and item discount is how much of it was given off.
          {splitGst ? ` Net value is what the customer paid with ${GST_PERCENT}% GST taken out.` : ""}{" "}
          Margin = net value minus cost value. Margin % is on cost, like the old software; &quot;% of
          sales&quot; is margin over net value. Cost includes the supplier&apos;s GST and is the cost
          saved when the piece was sold.
        </p>
      </section>
    </div>
  );
}
