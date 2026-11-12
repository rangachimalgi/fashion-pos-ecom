"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { listSuppliers, type Supplier } from "@/lib/purchases";
import {
  VIEW_LABELS,
  buildTable,
  exportPurchaseReportPdf,
  exportPurchaseReportXlsx,
  fetchPurchaseReport,
  sumBills,
  type CellKind,
  type PurchaseReportData,
  type PurchaseReportFilters,
  type PurchaseView,
} from "@/lib/purchaseReport";
import {
  PRESET_LABELS,
  presetRange,
  rangeLabel,
  todayInShop,
  type ReportPreset,
} from "@/lib/salesReport";
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

function inr(amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded < 0 ? "-" : ""}₹${Math.abs(rounded).toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function show(cell: string | number, kind: CellKind) {
  if (typeof cell === "string") return cell;
  if (kind === "money") return inr(cell);
  if (kind === "pct") return `${Math.round(cell * 100) / 100}%`;
  return cell.toLocaleString("en-IN");
}

/** The items table can have thousands of lines; the screen shows the first part, Excel has all. */
const SCREEN_ROW_LIMIT = 300;

export default function PurchasesReportPage() {
  const [preset, setPreset] = useState<ReportPreset>("thisMonth");
  const [from, setFrom] = useState(() => presetRange("thisMonth").from);
  const [to, setTo] = useState(() => presetRange("thisMonth").to);
  const [supplierId, setSupplierId] = useState("");
  const [view, setView] = useState<PurchaseView>("bills");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [data, setData] = useState<PurchaseReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const rangeInvalid = Boolean(from && to && from > to);
  const filters: PurchaseReportFilters = useMemo(
    () => ({ from, to, supplierId }),
    [from, to, supplierId]
  );

  useEffect(() => {
    let cancelled = false;
    listSuppliers(supabase)
      .then((list) => {
        if (!cancelled) setSuppliers(list);
      })
      .catch(() => {
        // The report below shows the real error; the filter just stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (rangeInvalid) return;
    let cancelled = false;
    fetchPurchaseReport(supabase, filters)
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

  const supplierName = supplierId
    ? (suppliers.find((supplier) => supplier.id === supplierId)?.name ?? "Selected supplier")
    : "All suppliers";

  const totals = useMemo(() => sumBills(data?.bills ?? []), [data]);
  const table = useMemo(() => (data ? buildTable(view, data) : null), [data, view]);
  const hasData = Boolean(data && data.bills.length > 0);

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
      const args = { data, filters, supplierName };
      if (kind === "xlsx") await exportPurchaseReportXlsx(args);
      else await exportPurchaseReportPdf({ ...args, view });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the file");
    } finally {
      setExporting(null);
    }
  };

  const cards = [
    { label: "Total purchased", value: inr(totals.total), strong: true, sub: `${totals.bills} bills` },
    { label: "Pieces bought", value: totals.pieces.toLocaleString("en-IN") },
    { label: "Gross (before discount)", value: inr(totals.gross) },
    { label: "Supplier discount", value: inr(totals.discount) },
    { label: "Taxable value", value: inr(totals.taxable) },
    { label: "GST paid", value: inr(totals.gst) },
    { label: "Cost of pieces (incl. GST)", value: inr(totals.cost) },
    { label: "Value at MRP", value: inr(totals.mrpValue) },
  ];

  const shownRows = table ? table.rows.slice(0, SCREEN_ROW_LIMIT) : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-6">
      <HomeBackLink />
      <ReportTabs active="purchases" />

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
            Supplier
            <select
              value={supplierId}
              onChange={(event) => {
                setLoading(true);
                setSupplierId(event.target.value);
              }}
              className="h-8 max-w-56 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
            >
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {rangeInvalid ? (
          <p className="mt-3 text-sm text-destructive">The start date is after the end date.</p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeLabel(from, to)}</span> ·{" "}
            {supplierName}. Dates are the day each purchase was entered.
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

      {/* ---------- Tables ---------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {VIEW_LABELS.map((item) => (
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
              {exporting === "xlsx" ? "Making Excel…" : "Excel (all tables)"}
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
                  <TableCell colSpan={12} className="py-6 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : shownRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={table.cols.length} className="py-6 text-center text-muted-foreground">
                    No purchases in this period.
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
                          index === (view === "bills" || view === "items" ? 3 : 0) && "font-medium"
                        )}
                      >
                        {show(cell, table.cols[index].kind)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
            {!loading && table?.foot && shownRows.length > 0 ? (
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

        {table && table.rows.length > SCREEN_ROW_LIMIT && !loading ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing the first {SCREEN_ROW_LIMIT} of {table.rows.length.toLocaleString("en-IN")} rows. The
            totals row counts all of them, and the Excel file has every row.
          </p>
        ) : null}

        <p className="mt-3 text-xs text-muted-foreground">
          Gross is quantity × rate. Taxable is after the supplier discount, before GST. Cost of pieces
          includes the supplier&apos;s GST, the same cost the POS uses for profit. Value at MRP is what the
          pieces are priced at in the shop (MRP includes the GST you collect when selling).
        </p>
      </section>
    </div>
  );
}
