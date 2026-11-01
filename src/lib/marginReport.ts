import type { SupabaseClient } from "@supabase/supabase-js";
import { toCheckoutError } from "@/lib/placeOrder";
import { formatReceiptBillNo } from "@/lib/posReceipt";
import {
  fileSpan,
  generated,
  pdfNumber,
  type Cell,
  type CellKind,
  type TableSpec,
} from "@/lib/purchaseReport";
import { rangeLabel, sourceLabel, todayInShop, SHOP_TIMEZONE, type ReportSource } from "@/lib/salesReport";

// ---------------------------------------------------------------------------
// Item-wise margin report (admin only). One row per bill line, like the old
// software. Reads supabase/migrations/020_margin_report.sql.
//
//   Sale value  = MRP x qty
//   Item disc   = Sale value - what the customer paid
//   Net value   = what the customer paid, with the GST taken out
//   Margin amt  = Net value - Cost value
//   Margin %    = Margin amt / Cost value   (like the old software)
//   % of sales  = Margin amt / Net value
// ---------------------------------------------------------------------------

export type MarginFilters = {
  /** Inclusive YYYY-MM-DD, or "" for no limit. */
  from: string;
  to: string;
  source: ReportSource;
};

export type MarginLine = {
  soldAt: string;
  /** Shop-local day, YYYY-MM-DD. */
  date: string;
  orderId: string;
  billNo: string;
  source: string;
  itemCode: string;
  styleCode: string;
  itemName: string;
  size: string;
  color: string;
  qty: number;
  mrp: number;
  unitPrice: number;
  unitCost: number | null;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const PAGE = 1000;
const MAX_PAGES = 200;

export async function fetchMarginLines(
  supabase: SupabaseClient,
  filters: MarginFilters
): Promise<MarginLine[]> {
  const out: MarginLine[] = [];

  for (let index = 0; index < MAX_PAGES; index += 1) {
    const { data, error } = await supabase
      .rpc("margin_report_lines", {
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_source: filters.source === "ALL" ? null : filters.source,
        p_timezone: SHOP_TIMEZONE,
      })
      .range(index * PAGE, index * PAGE + PAGE - 1);

    if (error) {
      if (error.code === "PGRST202") {
        throw new Error("The margin report is not set up yet. Run supabase/migrations/020_margin_report.sql.");
      }
      throw toCheckoutError(error);
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const soldAt = String(row.sold_at);
      const orderId = String(row.order_id);
      out.push({
        soldAt,
        date: todayInShop(new Date(soldAt)),
        orderId,
        billNo: formatReceiptBillNo(orderId, new Date(soldAt)),
        source: String(row.source),
        itemCode: (row.item_code as string | null) ?? "",
        styleCode: (row.style_code as string | null) ?? "",
        itemName: String(row.item_name),
        size: (row.size as string | null) ?? "",
        color: (row.color as string | null) ?? "",
        qty: Number(row.qty),
        mrp: Number(row.mrp),
        unitPrice: Number(row.unit_price),
        unitCost: row.unit_cost == null ? null : Number(row.unit_cost),
      });
    }
    if (rows.length < PAGE) break;
  }

  return out;
}

export type MarginRow = {
  line: MarginLine;
  saleValue: number;
  /** What the customer paid (GST included). */
  paid: number;
  itemDisc: number;
  net: number;
  cost: number | null;
  margin: number | null;
  /** Margin / cost, in percent. */
  onCost: number | null;
  /** Margin / net value, in percent. */
  onSales: number | null;
};

export function computeRows(lines: MarginLine[], gstPercent: number): MarginRow[] {
  return lines.map((line) => {
    const saleValue = line.mrp * line.qty;
    const paid = line.unitPrice * line.qty;
    const net = paid / (1 + gstPercent / 100);
    const cost = line.unitCost == null ? null : line.unitCost * line.qty;
    const margin = cost == null ? null : net - cost;
    return {
      line,
      saleValue,
      paid,
      itemDisc: saleValue - paid,
      net,
      cost,
      margin,
      onCost: margin == null || cost == null || cost <= 0 ? null : (margin / cost) * 100,
      onSales: margin == null || net <= 0 ? null : (margin / net) * 100,
    };
  });
}

export type MarginTotals = {
  bills: number;
  pieces: number;
  saleValue: number;
  itemDisc: number;
  net: number;
  /** Cost and margin only count lines that have a cost on record. */
  cost: number;
  margin: number;
  /** Net value of lines with no cost price (left out of margin). */
  netWithoutCost: number;
  onCost: number | null;
  onSales: number | null;
};

export function totalsOf(rows: MarginRow[]): MarginTotals {
  const bills = new Set<string>();
  let pieces = 0;
  let saleValue = 0;
  let itemDisc = 0;
  let net = 0;
  let cost = 0;
  let margin = 0;
  let costedNet = 0;
  let netWithoutCost = 0;

  for (const row of rows) {
    bills.add(row.line.orderId);
    pieces += row.line.qty;
    saleValue += row.saleValue;
    itemDisc += row.itemDisc;
    net += row.net;
    if (row.cost == null || row.margin == null) {
      netWithoutCost += row.net;
    } else {
      cost += row.cost;
      margin += row.margin;
      costedNet += row.net;
    }
  }

  return {
    bills: bills.size,
    pieces,
    saleValue: round2(saleValue),
    itemDisc: round2(itemDisc),
    net: round2(net),
    cost: round2(cost),
    margin: round2(margin),
    netWithoutCost: round2(netWithoutCost),
    onCost: cost > 0 ? (margin / cost) * 100 : null,
    onSales: costedNet > 0 ? (margin / costedNet) * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// One table description for the screen, the Excel file and the PDF
// ---------------------------------------------------------------------------

function dayText(ymd: string) {
  const [year, month, day] = ymd.split("-");
  return `${day}-${month}-${year.slice(2)}`;
}

export function buildMarginTable(rows: MarginRow[], gstOn: boolean): TableSpec {
  const t = totalsOf(rows);
  const blank = (value: number | null): Cell => (value == null ? "" : value);
  const pct = (value: number | null): Cell => (value == null ? "" : round2(value));

  return {
    cols: [
      { header: "Date", kind: "text" },
      { header: "Bill no", kind: "text" },
      { header: "Item code", kind: "text" },
      { header: "Item name", kind: "text" },
      { header: "Size", kind: "text" },
      { header: "Qty", kind: "int" },
      { header: "Cost value", kind: "money" },
      { header: "Sale value", kind: "money" },
      { header: "Item disc", kind: "money" },
      { header: gstOn ? "Net value" : "Paid", kind: "money" },
      { header: "Margin amt", kind: "money" },
      { header: "Margin %", kind: "pct" },
      { header: "% of sales", kind: "pct" },
    ],
    rows: rows.map((row) => [
      dayText(row.line.date),
      row.line.billNo,
      row.line.itemCode || "—",
      row.line.itemName,
      row.line.size || "—",
      row.line.qty,
      blank(row.cost == null ? null : round2(row.cost)),
      round2(row.saleValue),
      round2(row.itemDisc),
      round2(row.net),
      blank(row.margin == null ? null : round2(row.margin)),
      pct(row.onCost),
      pct(row.onSales),
    ]),
    foot: [
      "Total",
      "",
      "",
      "",
      "",
      t.pieces,
      t.cost,
      t.saleValue,
      t.itemDisc,
      t.net,
      t.margin,
      pct(t.onCost),
      pct(t.onSales),
    ],
  };
}

export function marginSummary(
  rows: MarginRow[],
  filters: MarginFilters,
  gstPercent: number
): Array<[string, Cell, CellKind]> {
  const t = totalsOf(rows);
  const pct = (value: number | null): Cell => (value == null ? "" : round2(value));
  return [
    ["Period", rangeLabel(filters.from, filters.to), "text"],
    ["Channel", sourceLabel(filters.source), "text"],
    ["Bills", t.bills, "int"],
    ["Pieces sold", t.pieces, "int"],
    ["Sale value (MRP)", t.saleValue, "money"],
    ["Item discount", t.itemDisc, "money"],
    [gstPercent > 0 ? "Net value (GST taken out)" : "Paid by customers", t.net, "money"],
    ["Cost value", t.cost, "money"],
    ["Margin", t.margin, "money"],
    ["Margin % (on cost)", pct(t.onCost), "pct"],
    ["Margin % (of sales)", pct(t.onSales), "pct"],
    ["Sales with no cost price (not in margin)", t.netWithoutCost, "money"],
  ];
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

type ExportArgs = { rows: MarginRow[]; filters: MarginFilters; gstPercent: number };

export async function exportMarginXlsx({ rows, filters, gstPercent }: ExportArgs) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();

  const summary = XLSX.utils.aoa_to_sheet([
    ["Margin report"],
    [],
    ...marginSummary(rows, filters, gstPercent).map(([label, value]) => [label, value]),
    ["GST", gstPercent > 0 ? `${gstPercent}% taken out of what the customer paid` : "Not separated"],
    ["Generated", generated()],
    [],
    [
      "Margin % = margin / cost value (as in the old software). Cost includes the supplier's GST. " +
        "Sale value uses each item's current MRP.",
    ],
  ]);
  summary["!cols"] = [{ wch: 40 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(book, summary, "Summary");

  const table = buildMarginTable(rows, gstPercent > 0);
  const sheet = XLSX.utils.aoa_to_sheet([
    [...table.cols.map((col) => col.header), "Colour", "Style code", "Channel"],
    ...table.rows.map((row, index) => [
      ...row,
      rows[index].line.color,
      rows[index].line.styleCode,
      rows[index].line.source,
    ]),
    ...(table.foot ? [table.foot] : []),
  ]);
  sheet["!cols"] = [...table.cols.map((col) => ({ wch: col.kind === "text" ? 20 : 13 })), { wch: 12 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(book, sheet, "Margin");

  XLSX.writeFile(book, `margin-report_${fileSpan(filters)}.xlsx`);
}

export async function exportMarginPdf({ rows, filters, gstPercent }: ExportArgs) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Margin report", margin, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    `${rangeLabel(filters.from, filters.to)}  |  ${sourceLabel(filters.source)}  |  Generated ${generated()}  |  Amounts in Rs.` +
      (gstPercent > 0 ? `  |  ${gstPercent}% GST taken out of net value` : ""),
    margin,
    50
  );
  doc.setTextColor(0);

  const lines = marginSummary(rows, filters, gstPercent).slice(2);
  const half = Math.ceil(lines.length / 2);
  const summaryRows = Array.from({ length: half }, (_, index) => {
    const fmt = (item: [string, Cell, CellKind] | undefined) =>
      item ? [item[0], pdfNumber(item[1], item[2])] : ["", ""];
    return [...fmt(lines[index]), ...fmt(lines[index + half])];
  });
  autoTable(doc, {
    startY: 62,
    body: summaryRows,
    theme: "grid",
    tableWidth: "wrap",
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold" },
      1: { halign: "right" },
      2: { fontStyle: "bold" },
      3: { halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  const table = buildMarginTable(rows, gstPercent > 0);
  const afterSummary = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  const alignRight = table.cols.map((col) => col.kind !== "text");

  autoTable(doc, {
    startY: afterSummary + 14,
    head: [table.cols.map((col) => col.header)],
    body: table.rows.map((row) => row.map((cell, index) => pdfNumber(cell, table.cols[index].kind))),
    foot: table.foot ? [table.foot.map((cell, index) => pdfNumber(cell, table.cols[index].kind))] : undefined,
    showFoot: "lastPage",
    theme: "striped",
    headStyles: { fillColor: [30, 30, 30], fontSize: 7.5 },
    footStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    didParseCell: (hook) => {
      if (alignRight[hook.column.index]) hook.cell.styles.halign = "right";
    },
    margin: { left: margin, right: margin, bottom: 32 },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Page ${page} of ${pages}`,
      doc.internal.pageSize.getWidth() - margin,
      doc.internal.pageSize.getHeight() - 14,
      { align: "right" }
    );
  }

  doc.save(`margin-report_${fileSpan(filters)}.pdf`);
}
