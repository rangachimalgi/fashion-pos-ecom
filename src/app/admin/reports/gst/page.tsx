"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  GST_VIEWS,
  buildGstTable,
  exportGstPdf,
  exportGstXlsx,
  fetchGstReport,
  gstTotals,
  type GstData,
  type GstFilters,
  type GstView,
} from "@/lib/gstReport";
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

function inr(amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded < 0 ? "-" : ""}₹${Math.abs(rounded).toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function show(cell: string | number, kind: CellKind) {
  if (typeof cell === "string") return cell;
  if (kind === "money") {
    return cell.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return cell.toLocaleString("en-IN");
}

export default function GstReportPage() {
  const [preset, setPreset] = useState<ReportPreset>("thisMonth");
  const [from, setFrom] = useState(() => presetRange("thisMonth").from);
  const [to, setTo] = useState(() => presetRange("thisMonth").to);
  const [source, setSource] = useState<ReportSource>("ALL");
  const [view, setView] = useState<GstView>("hsn");

  const [data, setData] = useState<GstData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const rangeInvalid = Boolean(from && to && from > to);
  const filters: GstFilters = useMemo(() => ({ from, to, source }), [from, to, source]);

  useEffect(() => {
    if (rangeInvalid) return;
    let cancelled = false;
    fetchGstReport(supabase, filters, GST_PERCENT)
      .then((result) => {
        if (cancelled) return;
        setData(result);
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

  const totals = useMemo(() => (data ? gstTotals(data) : null), [data]);
  const table = useMemo(() => (data ? buildGstTable(view, data) : null), [data, view]);
  const hasData = Boolean(data && (data.hsn.length > 0 || data.months.length > 0));

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
    if (!data || exporting) return;
    setExporting(kind);
    try {
      const args = { data, filters, gstPercent: GST_PERCENT };
      if (kind === "xlsx") await exportGstXlsx(args);
      else await exportGstPdf({ ...args, view });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the file");
    } finally {
      setExporting(null);
    }
  };

  const cards = totals
    ? [
        { label: "Sales incl. GST", value: inr(totals.net) },
        { label: "Taxable sales", value: inr(totals.taxable) },
        {
          label: "Output GST (collected)",
          value: inr(totals.gst),
          sub: `CGST ${inr(totals.cgst)} · SGST ${inr(totals.sgst)}`,
        },
        { label: "Input GST (purchases)", value: inr(totals.inputGst), sub: `on ${inr(totals.purchaseTaxable)} taxable` },
        {
          label: totals.payable < 0 ? "GST credit (input > output)" : "GST payable",
          value: inr(Math.abs(totals.payable)),
          strong: true,
          sub: "output minus input",
        },
        { label: "Pieces sold", value: totals.pieces.toLocaleString("en-IN") },
      ]
    : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-6">
      <ReportTabs active="gst" />

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
              onChange={(event) => changeDate("to", event.target.value)}
              className="h-8 w-40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Sales channel
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
        </div>

        {rangeInvalid ? (
          <p className="mt-3 text-sm text-destructive">The start date is after the end date.</p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeLabel(from, to)}</span>. Sales GST is
            worked out at {GST_PERCENT}% ({STORE_RECEIPT.cgstRate}% CGST + {STORE_RECEIPT.sgstRate}% SGST).
            Purchases count by the day they were entered.
          </p>
        )}
      </section>

      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      {/* ---------- Totals ---------- */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {(loading || !totals ? Array.from({ length: 6 }, () => null) : cards).map((card, index) => (
          <div
            key={card?.label ?? index}
            className={cn(
              "rounded-xl border border-border bg-white px-4 py-3",
              card?.strong && "border-foreground/30 bg-muted/40"
            )}
          >
            <p className="text-xs text-muted-foreground">{card?.label ?? "…"}</p>
            <p className="text-xl font-semibold tracking-tight tabular-nums">{card?.value ?? "…"}</p>
            {card?.sub ? <p className="text-xs text-muted-foreground">{card.sub}</p> : null}
          </div>
        ))}
      </section>

      {!loading && totals && totals.piecesWithoutHsn > 0 ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {totals.piecesWithoutHsn.toLocaleString("en-IN")} pieces sold have no HSN code, so they are listed
          under &quot;(no HSN)&quot;. Type the HSN on each line when you enter a purchase to get them
          grouped properly.
        </p>
      ) : null}

      {/* ---------- Tables ---------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {GST_VIEWS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={view === item.id ? "default" : "outline"}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </Button>
          ))}

          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || Boolean(exporting) || rangeInvalid || !hasData}
              onClick={() => handleExport("xlsx")}
            >
              <Download className="size-4" />
              {exporting === "xlsx" ? "Making Excel…" : "Excel (both tables)"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || Boolean(exporting) || rangeInvalid || !hasData}
              onClick={() => handleExport("pdf")}
            >
              <FileText className="size-4" />
              {exporting === "pdf" ? "Making PDF…" : "PDF (this table)"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                {(table?.cols ?? []).map((col) => (
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
              {loading || !table ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : table.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={table.cols.length} className="py-6 text-center text-muted-foreground">
                    Nothing in this period.
                  </TableCell>
                </TableRow>
              ) : (
                table.rows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell, index) => (
                      <TableCell
                        key={index}
                        className={cn(
                          "whitespace-nowrap",
                          table.cols[index].kind !== "text" && "text-right tabular-nums",
                          index === 0 && "font-medium",
                          view === "month" && index === 8 && typeof cell === "number" && cell < 0 && "text-destructive"
                        )}
                      >
                        {show(cell, table.cols[index].kind)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
            {!loading && table?.foot && table.rows.length > 0 ? (
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

        <p className="mt-3 text-xs text-muted-foreground">
          {view === "hsn"
            ? "Total value is MRP × quantity, net value is what customers paid, and taxable value is the net value with GST taken out. An item's HSN is the one typed on its latest purchase entry."
            : "Output GST is collected on sales; input GST is paid to suppliers on purchases. GST payable = output minus input, shown red when input is higher. It is an indication only: whether input GST can be claimed is for your CA to decide."}
        </p>
      </section>
    </div>
  );
}
