import type { SupabaseClient } from "@supabase/supabase-js";
import { toCheckoutError } from "@/lib/placeOrder";
import { exportTablePdf } from "@/lib/reportPdf";
import { fetchPurchaseReport, fileSpan, generated, groupBills, round2, type Cell, type CellKind, type TableSpec } from "@/lib/purchaseReport";
import {
  fetchSalesReport,
  periodLabel,
  rangeLabel,
  sourceLabel,
  SHOP_TIMEZONE,
  type ReportSource,
} from "@/lib/salesReport";

// ---------------------------------------------------------------------------
// GST report (admin only).
//   Sales by HSN : supabase/migrations/021_gst_hsn_summary.sql (like the old
//                  software's HSN summary, plus the GST split).
//   By month     : output GST on sales (Sales & profit report) against input
//                  GST paid on purchases (Purchases report), so you can see
//                  what is left to pay. Purchases count by entry date.
// ---------------------------------------------------------------------------

export type GstFilters = {
  /** Inclusive YYYY-MM-DD, or "" for no limit. */
  from: string;
  to: string;
  source: ReportSource;
};

export type HsnRow = {
  /** "" = no HSN on record. */
  hsn: string;
  pieces: number;
  /** MRP x qty. */
  totalValue: number;
  itemDisc: number;
  /** What customers paid, GST included. */
  net: number;
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
};

export type MonthRow = {
  /** First day of the month, YYYY-MM-DD. */
  period: string;
  salesPaid: number;
  salesTaxable: number;
  cgst: number;
  sgst: number;
  outputGst: number;
  purchaseTaxable: number;
  inputGst: number;
  /** outputGst - inputGst; negative = more GST paid than collected. */
  payable: number;
};

export type GstData = {
  hsn: HsnRow[];
  months: MonthRow[];
};

export async function fetchGstReport(
  supabase: SupabaseClient,
  filters: GstFilters,
  gstPercent: number
): Promise<GstData> {
  const [hsnResult, sales, purchases] = await Promise.all([
    supabase.rpc("gst_hsn_summary", {
      p_from: filters.from || null,
      p_to: filters.to || null,
      p_source: filters.source === "ALL" ? null : filters.source,
      p_gst_percent: gstPercent,
      p_timezone: SHOP_TIMEZONE,
    }),
    fetchSalesReport(supabase, { ...filters, gstPercent }, "month"),
    fetchPurchaseReport(supabase, { from: filters.from, to: filters.to, supplierId: "" }),
  ]);

  if (hsnResult.error) {
    if (hsnResult.error.code === "PGRST202") {
      throw new Error("The GST report is not set up yet. Run supabase/migrations/021_gst_hsn_summary.sql.");
    }
    throw toCheckoutError(hsnResult.error);
  }

  const hsn: HsnRow[] = ((hsnResult.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const gst = Number(row.gst_amount);
    const cgst = round2(gst / 2);
    return {
      hsn: String(row.hsn ?? ""),
      pieces: Number(row.pieces),
      totalValue: Number(row.total_value),
      itemDisc: Number(row.item_disc),
      net: Number(row.net_value),
      taxable: Number(row.taxable_value),
      gst,
      cgst,
      sgst: round2(gst - cgst),
    };
  });

  const byMonth = new Map<string, MonthRow>();
  const get = (period: string): MonthRow => {
    let row = byMonth.get(period);
    if (!row) {
      row = {
        period,
        salesPaid: 0,
        salesTaxable: 0,
        cgst: 0,
        sgst: 0,
        outputGst: 0,
        purchaseTaxable: 0,
        inputGst: 0,
        payable: 0,
      };
      byMonth.set(period, row);
    }
    return row;
  };

  for (const sale of sales) {
    const row = get(sale.period);
    row.salesPaid = sale.gross;
    row.salesTaxable = sale.net;
    row.outputGst = sale.gst;
    row.cgst = round2(sale.gst / 2);
    row.sgst = round2(sale.gst - row.cgst);
  }
  for (const group of groupBills(purchases.bills, "month")) {
    const row = get(group.key);
    row.purchaseTaxable = group.taxable;
    row.inputGst = group.gst;
  }

  const months = [...byMonth.values()]
    .map((row) => ({ ...row, payable: round2(row.outputGst - row.inputGst) }))
    .sort((a, b) => (a.period < b.period ? 1 : -1));

  return { hsn, months };
}

export type GstTotals = {
  pieces: number;
  totalValue: number;
  itemDisc: number;
  net: number;
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  inputGst: number;
  purchaseTaxable: number;
  payable: number;
  /** Pieces sold with no HSN on record. */
  piecesWithoutHsn: number;
};

export function gstTotals(data: GstData): GstTotals {
  const sum = {
    pieces: 0,
    totalValue: 0,
    itemDisc: 0,
    net: 0,
    taxable: 0,
    gst: 0,
    cgst: 0,
    sgst: 0,
    piecesWithoutHsn: 0,
  };
  for (const row of data.hsn) {
    sum.pieces += row.pieces;
    sum.totalValue += row.totalValue;
    sum.itemDisc += row.itemDisc;
    sum.net += row.net;
    sum.taxable += row.taxable;
    sum.gst += row.gst;
    sum.cgst += row.cgst;
    sum.sgst += row.sgst;
    if (!row.hsn) sum.piecesWithoutHsn += row.pieces;
  }
  const inputGst = round2(data.months.reduce((s, m) => s + m.inputGst, 0));
  const purchaseTaxable = round2(data.months.reduce((s, m) => s + m.purchaseTaxable, 0));
  return {
    pieces: sum.pieces,
    totalValue: round2(sum.totalValue),
    itemDisc: round2(sum.itemDisc),
    net: round2(sum.net),
    taxable: round2(sum.taxable),
    gst: round2(sum.gst),
    // Split the total, so the cards and the By month table agree to the paisa.
    cgst: round2(sum.gst / 2),
    sgst: round2(sum.gst - round2(sum.gst / 2)),
    inputGst,
    purchaseTaxable,
    payable: round2(sum.gst - inputGst),
    piecesWithoutHsn: sum.piecesWithoutHsn,
  };
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export type GstView = "hsn" | "month";

export const GST_VIEWS: Array<{ id: GstView; label: string }> = [
  { id: "hsn", label: "Sales by HSN" },
  { id: "month", label: "By month" },
];

export function buildGstTable(view: GstView, data: GstData): TableSpec {
  if (view === "hsn") {
    const t = gstTotals(data);
    return {
      cols: [
        { header: "HSN", kind: "text" },
        { header: "UQC", kind: "text" },
        { header: "Qty", kind: "int" },
        { header: "Total value", kind: "money" },
        { header: "Item disc", kind: "money" },
        { header: "Net value", kind: "money" },
        { header: "Taxable value", kind: "money" },
        { header: "CGST", kind: "money" },
        { header: "SGST", kind: "money" },
      ],
      rows: data.hsn.map((r) => [
        r.hsn || "(no HSN)",
        "NOS",
        r.pieces,
        r.totalValue,
        r.itemDisc,
        r.net,
        r.taxable,
        r.cgst,
        r.sgst,
      ]),
      // Column sums of the rows above, so the table adds up exactly.
      foot: [
        "Grand total",
        "",
        t.pieces,
        t.totalValue,
        t.itemDisc,
        t.net,
        t.taxable,
        round2(data.hsn.reduce((s, r) => s + r.cgst, 0)),
        round2(data.hsn.reduce((s, r) => s + r.sgst, 0)),
      ],
    };
  }

  const sum = (pick: (m: MonthRow) => number) => round2(data.months.reduce((s, m) => s + pick(m), 0));
  return {
    cols: [
      { header: "Month", kind: "text" },
      { header: "Sales incl. GST", kind: "money" },
      { header: "Taxable sales", kind: "money" },
      { header: "CGST", kind: "money" },
      { header: "SGST", kind: "money" },
      { header: "Output GST", kind: "money" },
      { header: "Purchases taxable", kind: "money" },
      { header: "Input GST", kind: "money" },
      { header: "GST payable", kind: "money" },
    ],
    rows: data.months.map((m) => [
      periodLabel(m.period, "month"),
      m.salesPaid,
      m.salesTaxable,
      m.cgst,
      m.sgst,
      m.outputGst,
      m.purchaseTaxable,
      m.inputGst,
      m.payable,
    ]),
    foot: [
      "Total",
      sum((m) => m.salesPaid),
      sum((m) => m.salesTaxable),
      sum((m) => m.cgst),
      sum((m) => m.sgst),
      sum((m) => m.outputGst),
      sum((m) => m.purchaseTaxable),
      sum((m) => m.inputGst),
      sum((m) => m.payable),
    ],
  };
}

export function gstSummary(
  data: GstData,
  filters: GstFilters,
  gstPercent: number
): Array<[string, Cell, CellKind]> {
  const t = gstTotals(data);
  return [
    ["Period", rangeLabel(filters.from, filters.to), "text"],
    ["Sales channel", sourceLabel(filters.source), "text"],
    ["GST rate used on sales", `${gstPercent}%`, "text"],
    ["Pieces sold", t.pieces, "int"],
    ["Sales incl. GST", t.net, "money"],
    ["Taxable sales", t.taxable, "money"],
    ["Output GST (CGST)", t.cgst, "money"],
    ["Output GST (SGST)", t.sgst, "money"],
    ["Output GST total", t.gst, "money"],
    ["Purchases taxable (by entry date)", t.purchaseTaxable, "money"],
    ["Input GST on purchases", t.inputGst, "money"],
    ["GST payable (output - input)", t.payable, "money"],
  ];
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

type ExportArgs = { data: GstData; filters: GstFilters; gstPercent: number };

const NOTE =
  "Output GST is worked out from what customers paid at the rate above. Input GST is the GST on supplier " +
  "purchase entries. GST payable is an indication only; whether input GST can be claimed is for your CA to decide.";

export async function exportGstXlsx({ data, filters, gstPercent }: ExportArgs) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();

  const summary = XLSX.utils.aoa_to_sheet([
    ["GST report"],
    [],
    ...gstSummary(data, filters, gstPercent).map(([label, value]) => [label, value]),
    ["Generated", generated()],
    [],
    [NOTE],
  ]);
  summary["!cols"] = [{ wch: 38 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(book, summary, "Summary");

  for (const view of GST_VIEWS) {
    const table = buildGstTable(view.id, data);
    const sheet = XLSX.utils.aoa_to_sheet([
      table.cols.map((col) => col.header),
      ...table.rows,
      ...(table.foot ? [table.foot] : []),
    ]);
    sheet["!cols"] = table.cols.map((col) => ({ wch: col.kind === "text" ? 18 : 16 }));
    XLSX.utils.book_append_sheet(book, sheet, view.label);
  }

  XLSX.writeFile(book, `gst-report_${fileSpan(filters)}.xlsx`);
}

export async function exportGstPdf({ data, filters, gstPercent, view }: ExportArgs & { view: GstView }) {
  const info = GST_VIEWS.find((item) => item.id === view) ?? GST_VIEWS[0];
  await exportTablePdf({
    title: "GST report",
    subtitle: `${rangeLabel(filters.from, filters.to)}  |  ${sourceLabel(filters.source)}  |  GST ${gstPercent}% on sales`,
    summary: gstSummary(data, filters, gstPercent).slice(3),
    heading: info.label,
    table: buildGstTable(view, data),
    fileName: `gst-report_${view}_${fileSpan(filters)}.pdf`,
  });
}
