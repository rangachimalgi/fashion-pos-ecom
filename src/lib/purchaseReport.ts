import type { SupabaseClient } from "@supabase/supabase-js";
import { toCheckoutError } from "@/lib/placeOrder";
import { periodLabel, rangeLabel, SHOP_TIMEZONE } from "@/lib/salesReport";

// ---------------------------------------------------------------------------
// Purchases report (admin only: the database only lets admins read purchases).
// No new migration: it reads the purchases / purchase_items tables from 019.
// Dates filter on the ENTRY date (the day the purchase was entered).
// ---------------------------------------------------------------------------

export type PurchaseReportFilters = {
  /** Inclusive YYYY-MM-DD, or "" for no limit. */
  from: string;
  to: string;
  /** "" = every supplier. */
  supplierId: string;
};

export type PurchaseBillRow = {
  id: string;
  entryNo: number;
  date: string;
  supplierId: string;
  supplier: string;
  invoiceNo: string;
  invoiceDate: string;
  pieces: number;
  /** qty x rate, before the supplier discount. */
  gross: number;
  discount: number;
  /** After discount, before GST. */
  taxable: number;
  gst: number;
  roundOff: number;
  /** What is owed to the supplier. */
  total: number;
  /** Landed cost of the pieces (rate - discount + GST). */
  cost: number;
  /** Value of the pieces at the selling price (MRP). */
  mrpValue: number;
};

export type PurchaseLineRow = {
  billId: string;
  lineNo: number;
  entryNo: number;
  date: string;
  supplier: string;
  invoiceNo: string;
  itemName: string;
  brand: string;
  design: string;
  department: string;
  category: string;
  color: string;
  size: string;
  qty: number;
  rate: number;
  discPercent: number;
  gstPercent: number;
  /** qty x rate less discount, before GST. */
  value: number;
  unitCost: number;
  costValue: number;
  mrp: number;
  mrpValue: number;
};

export type PurchaseReportData = {
  bills: PurchaseBillRow[];
  lines: PurchaseLineRow[];
};

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type DbError = { code?: string; message: string };

function friendly(error: DbError): Error {
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202") {
    return new Error("Purchases are not set up yet. Run supabase/migrations/019_purchases.sql.");
  }
  return toCheckoutError(error);
}

const PAGE = 1000;
const MAX_PAGES = 100;

/** Supabase returns at most 1000 rows per request, so read page by page. */
async function fetchAll(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: DbError | null }>
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (let index = 0; index < MAX_PAGES; index += 1) {
    const { data, error } = await page(index * PAGE, index * PAGE + PAGE - 1);
    if (error) throw friendly(error);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function fetchPurchaseReport(
  supabase: SupabaseClient,
  filters: PurchaseReportFilters
): Promise<PurchaseReportData> {
  const billRows = await fetchAll((start, end) => {
    let query = supabase
      .from("purchases")
      .select(
        "id, entry_no, entry_date, supplier_id, supplier_invoice_no, supplier_invoice_date, total_pieces, gross_value, discount_amount, net_items, gst_total, round_off, net_invoice, suppliers(name)"
      );
    if (filters.from) query = query.gte("entry_date", filters.from);
    if (filters.to) query = query.lte("entry_date", filters.to);
    if (filters.supplierId) query = query.eq("supplier_id", filters.supplierId);
    return query.order("entry_no", { ascending: false }).range(start, end);
  });

  const lineRows = await fetchAll((start, end) => {
    let query = supabase
      .from("purchase_items")
      .select(
        "id, purchase_id, line_no, item_name, brand, design, department, category, color, size, qty, rate, disc_percent, gst_percent, line_value, unit_cost, mrp, purchases!inner(entry_date, supplier_id)"
      );
    if (filters.from) query = query.gte("purchases.entry_date", filters.from);
    if (filters.to) query = query.lte("purchases.entry_date", filters.to);
    if (filters.supplierId) query = query.eq("purchases.supplier_id", filters.supplierId);
    return query.order("id", { ascending: true }).range(start, end);
  });

  const bills: PurchaseBillRow[] = billRows.map((row) => ({
    id: String(row.id),
    entryNo: Number(row.entry_no),
    date: String(row.entry_date),
    supplierId: String(row.supplier_id),
    supplier: one(row.suppliers as { name?: string } | { name?: string }[] | null)?.name ?? "—",
    invoiceNo: (row.supplier_invoice_no as string | null) ?? "",
    invoiceDate: (row.supplier_invoice_date as string | null) ?? "",
    pieces: Number(row.total_pieces),
    gross: Number(row.gross_value),
    discount: Number(row.discount_amount),
    taxable: Number(row.net_items),
    gst: Number(row.gst_total),
    roundOff: Number(row.round_off),
    total: Number(row.net_invoice),
    cost: 0,
    mrpValue: 0,
  }));

  const byId = new Map(bills.map((bill) => [bill.id, bill]));
  const lines: PurchaseLineRow[] = [];

  for (const row of lineRows) {
    const bill = byId.get(String(row.purchase_id));
    // A purchase saved while the report was loading is simply left out.
    if (!bill) continue;
    const qty = Number(row.qty);
    const unitCost = Number(row.unit_cost);
    const mrp = Number(row.mrp);
    bill.cost += qty * unitCost;
    bill.mrpValue += qty * mrp;
    lines.push({
      billId: bill.id,
      lineNo: Number(row.line_no),
      entryNo: bill.entryNo,
      date: bill.date,
      supplier: bill.supplier,
      invoiceNo: bill.invoiceNo,
      itemName: String(row.item_name),
      brand: (row.brand as string | null) ?? "",
      design: (row.design as string | null) ?? "",
      department: String(row.department),
      category: String(row.category),
      color: String(row.color),
      size: String(row.size),
      qty,
      rate: Number(row.rate),
      discPercent: Number(row.disc_percent),
      gstPercent: Number(row.gst_percent),
      value: Number(row.line_value),
      unitCost,
      costValue: round2(qty * unitCost),
      mrp,
      mrpValue: round2(qty * mrp),
    });
  }

  for (const bill of bills) {
    bill.cost = round2(bill.cost);
    bill.mrpValue = round2(bill.mrpValue);
  }

  // Newest purchase first; inside one purchase, in the order it was typed.
  lines.sort((a, b) => b.entryNo - a.entryNo || a.lineNo - b.lineNo);

  return { bills, lines };
}

// ---------------------------------------------------------------------------
// Totals and grouping
// ---------------------------------------------------------------------------

export type PurchaseTotals = {
  bills: number;
  pieces: number;
  gross: number;
  discount: number;
  taxable: number;
  gst: number;
  roundOff: number;
  total: number;
  cost: number;
  mrpValue: number;
};

export function sumBills(bills: PurchaseBillRow[]): PurchaseTotals {
  const sum: PurchaseTotals = {
    bills: 0,
    pieces: 0,
    gross: 0,
    discount: 0,
    taxable: 0,
    gst: 0,
    roundOff: 0,
    total: 0,
    cost: 0,
    mrpValue: 0,
  };
  for (const bill of bills) {
    sum.bills += 1;
    sum.pieces += bill.pieces;
    sum.gross += bill.gross;
    sum.discount += bill.discount;
    sum.taxable += bill.taxable;
    sum.gst += bill.gst;
    sum.roundOff += bill.roundOff;
    sum.total += bill.total;
    sum.cost += bill.cost;
    sum.mrpValue += bill.mrpValue;
  }
  return {
    bills: sum.bills,
    pieces: sum.pieces,
    gross: round2(sum.gross),
    discount: round2(sum.discount),
    taxable: round2(sum.taxable),
    gst: round2(sum.gst),
    roundOff: round2(sum.roundOff),
    total: round2(sum.total),
    cost: round2(sum.cost),
    mrpValue: round2(sum.mrpValue),
  };
}

export type PurchaseGroupBy = "supplier" | "month" | "day";

export type PurchaseGroup = PurchaseTotals & { key: string; label: string };

export function groupBills(bills: PurchaseBillRow[], by: PurchaseGroupBy): PurchaseGroup[] {
  const buckets = new Map<string, { label: string; bills: PurchaseBillRow[] }>();
  for (const bill of bills) {
    const key =
      by === "supplier" ? bill.supplierId : by === "month" ? `${bill.date.slice(0, 7)}-01` : bill.date;
    const label =
      by === "supplier" ? bill.supplier : periodLabel(key, by === "month" ? "month" : "day");
    const bucket = buckets.get(key);
    if (bucket) bucket.bills.push(bill);
    else buckets.set(key, { label, bills: [bill] });
  }

  const groups = [...buckets.entries()].map(([key, bucket]) => ({
    key,
    label: bucket.label,
    ...sumBills(bucket.bills),
  }));

  // Suppliers: biggest spend first. Days and months: newest first.
  if (by === "supplier") groups.sort((a, b) => b.total - a.total);
  else groups.sort((a, b) => (a.key < b.key ? 1 : -1));
  return groups;
}

// ---------------------------------------------------------------------------
// One table description used by the screen, the Excel file and the PDF
// ---------------------------------------------------------------------------

export type PurchaseView = "bills" | "supplier" | "month" | "day" | "items";

export const VIEW_LABELS: Array<{ id: PurchaseView; label: string; sheet: string }> = [
  { id: "bills", label: "Bills", sheet: "Bills" },
  { id: "supplier", label: "By supplier", sheet: "By supplier" },
  { id: "month", label: "By month", sheet: "By month" },
  { id: "day", label: "By day", sheet: "By day" },
  { id: "items", label: "Items", sheet: "Items" },
];

export type CellKind = "text" | "int" | "money" | "pct";
export type Cell = string | number;
export type TableSpec = {
  cols: Array<{ header: string; kind: CellKind }>;
  rows: Cell[][];
  /** Totals row, or null when totals make no sense for this table. */
  foot: Cell[] | null;
};

function dayText(date: string) {
  return date ? periodLabel(date, "day") : "";
}

export function buildTable(view: PurchaseView, data: PurchaseReportData): TableSpec {
  if (view === "bills") {
    const t = sumBills(data.bills);
    return {
      cols: [
        { header: "Entry no", kind: "int" },
        { header: "Entry date", kind: "text" },
        { header: "Supplier", kind: "text" },
        { header: "Supplier invoice", kind: "text" },
        { header: "Invoice date", kind: "text" },
        { header: "Pieces", kind: "int" },
        { header: "Gross", kind: "money" },
        { header: "Discount", kind: "money" },
        { header: "Taxable", kind: "money" },
        { header: "GST", kind: "money" },
        { header: "Round off", kind: "money" },
        { header: "Bill total", kind: "money" },
      ],
      rows: data.bills.map((b) => [
        b.entryNo,
        dayText(b.date),
        b.supplier,
        b.invoiceNo || "—",
        dayText(b.invoiceDate) || "—",
        b.pieces,
        b.gross,
        b.discount,
        b.taxable,
        b.gst,
        b.roundOff,
        b.total,
      ]),
      foot: ["", "Total", "", "", "", t.pieces, t.gross, t.discount, t.taxable, t.gst, t.roundOff, t.total],
    };
  }

  if (view === "items") {
    const qty = data.lines.reduce((s, l) => s + l.qty, 0);
    const value = round2(data.lines.reduce((s, l) => s + l.value, 0));
    const cost = round2(data.lines.reduce((s, l) => s + l.costValue, 0));
    const mrp = round2(data.lines.reduce((s, l) => s + l.mrpValue, 0));
    return {
      cols: [
        { header: "Entry no", kind: "int" },
        { header: "Entry date", kind: "text" },
        { header: "Supplier", kind: "text" },
        { header: "Item", kind: "text" },
        { header: "Brand", kind: "text" },
        { header: "Design", kind: "text" },
        { header: "Category", kind: "text" },
        { header: "Colour", kind: "text" },
        { header: "Size", kind: "text" },
        { header: "Qty", kind: "int" },
        { header: "Rate", kind: "money" },
        { header: "Disc %", kind: "pct" },
        { header: "GST %", kind: "pct" },
        { header: "Value", kind: "money" },
        { header: "Cost / pc", kind: "money" },
        { header: "Cost value", kind: "money" },
        { header: "MRP", kind: "money" },
        { header: "MRP value", kind: "money" },
      ],
      rows: data.lines.map((l) => [
        l.entryNo,
        dayText(l.date),
        l.supplier,
        l.itemName,
        l.brand || "—",
        l.design || "—",
        l.category,
        l.color,
        l.size,
        l.qty,
        l.rate,
        l.discPercent,
        l.gstPercent,
        l.value,
        l.unitCost,
        l.costValue,
        l.mrp,
        l.mrpValue,
      ]),
      foot: ["", "Total", "", "", "", "", "", "", "", qty, "", "", "", value, "", cost, "", mrp],
    };
  }

  const groups = groupBills(data.bills, view);
  const t = sumBills(data.bills);
  const first = view === "supplier" ? "Supplier" : view === "month" ? "Month" : "Date";
  return {
    cols: [
      { header: first, kind: "text" },
      { header: "Bills", kind: "int" },
      { header: "Pieces", kind: "int" },
      { header: "Gross", kind: "money" },
      { header: "Discount", kind: "money" },
      { header: "Taxable", kind: "money" },
      { header: "GST", kind: "money" },
      { header: "Round off", kind: "money" },
      { header: "Total purchased", kind: "money" },
      { header: "Cost of pieces", kind: "money" },
      { header: "Value at MRP", kind: "money" },
    ],
    rows: groups.map((g) => [
      g.label,
      g.bills,
      g.pieces,
      g.gross,
      g.discount,
      g.taxable,
      g.gst,
      g.roundOff,
      g.total,
      g.cost,
      g.mrpValue,
    ]),
    foot: ["Total", t.bills, t.pieces, t.gross, t.discount, t.taxable, t.gst, t.roundOff, t.total, t.cost, t.mrpValue],
  };
}

export function summaryLines(
  data: PurchaseReportData,
  filters: PurchaseReportFilters,
  supplierName: string
): Array<[string, Cell, CellKind]> {
  const t = sumBills(data.bills);
  const suppliers = new Set(data.bills.map((b) => b.supplierId)).size;
  return [
    ["Period (by entry date)", rangeLabel(filters.from, filters.to), "text"],
    ["Supplier", supplierName, "text"],
    ["Purchase bills", t.bills, "int"],
    ["Suppliers", suppliers, "int"],
    ["Pieces bought", t.pieces, "int"],
    ["Gross value (before discount)", t.gross, "money"],
    ["Supplier discount", t.discount, "money"],
    ["Taxable value", t.taxable, "money"],
    ["GST paid to suppliers", t.gst, "money"],
    ["Round off", t.roundOff, "money"],
    ["Total purchased (bill totals)", t.total, "money"],
    ["Cost of the pieces (incl. GST)", t.cost, "money"],
    ["Value of the pieces at MRP", t.mrpValue, "money"],
  ];
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

function fileSpan(filters: PurchaseReportFilters) {
  return !filters.from && !filters.to ? "all-time" : `${filters.from || "start"}_to_${filters.to || "today"}`;
}

function generated() {
  return new Date().toLocaleString("en-IN", { timeZone: SHOP_TIMEZONE });
}

type ExportArgs = {
  data: PurchaseReportData;
  filters: PurchaseReportFilters;
  supplierName: string;
};

/** Excel: a Summary sheet plus one sheet per view. Numbers stay real numbers. */
export async function exportPurchaseReportXlsx({ data, filters, supplierName }: ExportArgs) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();

  const summary = XLSX.utils.aoa_to_sheet([
    ["Purchases report"],
    [],
    ...summaryLines(data, filters, supplierName).map(([label, value]) => [label, value]),
    ["Generated", generated()],
    [],
    ["Dates are the day each purchase was entered. Cost includes the supplier's GST."],
  ]);
  summary["!cols"] = [{ wch: 36 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(book, summary, "Summary");

  for (const view of VIEW_LABELS) {
    const table = buildTable(view.id, data);
    const aoa: Cell[][] = [table.cols.map((col) => col.header), ...table.rows];
    if (table.foot) aoa.push(table.foot.map((cell) => (cell === "" ? "" : cell)));
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet["!cols"] = table.cols.map((col) => ({ wch: col.kind === "text" ? 22 : 14 }));
    XLSX.utils.book_append_sheet(book, sheet, view.sheet);
  }

  XLSX.writeFile(book, `purchases-report_${fileSpan(filters)}.xlsx`);
}

function pdfNumber(cell: Cell, kind: CellKind) {
  if (typeof cell === "string") return cell;
  if (kind === "money") {
    return cell.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (kind === "pct") return `${Math.round(cell * 100) / 100}`;
  return cell.toLocaleString("en-IN");
}

/** PDF: the summary plus the table you are looking at (landscape A4). */
export async function exportPurchaseReportPdf({
  data,
  filters,
  supplierName,
  view,
}: ExportArgs & { view: PurchaseView }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 28;
  const viewInfo = VIEW_LABELS.find((item) => item.id === view) ?? VIEW_LABELS[0];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Purchases report", margin, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    `${rangeLabel(filters.from, filters.to)}  |  Supplier: ${supplierName}  |  Generated ${generated()}  |  Amounts in Rs.`,
    margin,
    50
  );
  doc.setTextColor(0);

  const lines = summaryLines(data, filters, supplierName).slice(2);
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

  const table = buildTable(view, data);
  const afterSummary = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(viewInfo.label, margin, afterSummary + 22);

  const alignRight = table.cols.map((col) => col.kind !== "text");
  autoTable(doc, {
    startY: afterSummary + 28,
    head: [table.cols.map((col) => col.header)],
    body: table.rows.map((row) => row.map((cell, index) => pdfNumber(cell, table.cols[index].kind))),
    foot: table.foot ? [table.foot.map((cell, index) => pdfNumber(cell, table.cols[index].kind))] : undefined,
    showFoot: "lastPage",
    theme: "striped",
    headStyles: { fillColor: [30, 30, 30], fontSize: table.cols.length > 12 ? 6.5 : 8 },
    footStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
    styles: { fontSize: table.cols.length > 12 ? 6.5 : 8, cellPadding: 2.5 },
    // Headings and the totals row line up with their numbers.
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

  doc.save(`purchases-report_${viewInfo.id}_${fileSpan(filters)}.pdf`);
}
