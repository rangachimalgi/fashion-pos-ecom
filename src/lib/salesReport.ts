import type { SupabaseClient } from "@supabase/supabase-js";
import { toCheckoutError } from "@/lib/placeOrder";

/** All report dates are shop-local days; the database buckets in this zone too. */
export const SHOP_TIMEZONE = "Asia/Kolkata";

export type ReportBucket = "day" | "month";
export type ReportSource = "ALL" | "POS" | "ONLINE";

export type ReportRow = {
  /** First day of the day/month, as YYYY-MM-DD. */
  period: string;
  bills: number;
  pieces: number;
  /** What customers paid (GST included). */
  gross: number;
  gst: number;
  /** gross - gst. */
  net: number;
  /** Cost of the pieces sold (lines with a known cost). */
  cost: number;
  /** net - cost, over lines with a known cost. */
  profit: number;
  /** Net sales of lines with no cost price on record (not part of profit). */
  netWithoutCost: number;
};

export type ReportFilters = {
  /** Inclusive YYYY-MM-DD, or "" for no limit. */
  from: string;
  to: string;
  source: ReportSource;
  /** 0 = treat the bill total as the sales figure (no GST split). */
  gstPercent: number;
};

export async function fetchSalesReport(
  supabase: SupabaseClient,
  filters: ReportFilters,
  bucket: ReportBucket
): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc("sales_report", {
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_bucket: bucket,
    p_source: filters.source === "ALL" ? null : filters.source,
    p_gst_percent: filters.gstPercent,
    p_timezone: SHOP_TIMEZONE,
  });
  if (error) {
    if (error.code === "PGRST202") {
      throw new Error("Reports are not set up yet. Run supabase/migrations/017_sales_reports.sql.");
    }
    throw toCheckoutError(error);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    period: String(row.period),
    bills: Number(row.bills),
    pieces: Number(row.pieces),
    gross: Number(row.gross_sales),
    gst: Number(row.gst_amount),
    net: Number(row.net_sales),
    cost: Number(row.cost),
    profit: Number(row.profit),
    netWithoutCost: Number(row.sales_without_cost),
  }));
}

export type ReportTotals = Omit<ReportRow, "period">;

export function sumRows(rows: ReportRow[]): ReportTotals {
  return rows.reduce<ReportTotals>(
    (sum, row) => ({
      bills: sum.bills + row.bills,
      pieces: sum.pieces + row.pieces,
      gross: sum.gross + row.gross,
      gst: sum.gst + row.gst,
      net: sum.net + row.net,
      cost: sum.cost + row.cost,
      profit: sum.profit + row.profit,
      netWithoutCost: sum.netWithoutCost + row.netWithoutCost,
    }),
    { bills: 0, pieces: 0, gross: 0, gst: 0, net: 0, cost: 0, profit: 0, netWithoutCost: 0 }
  );
}

/**
 * Profit margin on the sales that have a cost on record. Sales with no cost
 * are left out of both sides, otherwise they would drag the margin down.
 */
export function marginPercent(row: ReportTotals): number | null {
  const base = row.net - row.netWithoutCost;
  if (base <= 0.005) return null;
  return (row.profit / base) * 100;
}

// ---------------------------------------------------------------------------
// Shop-local date helpers (plain YYYY-MM-DD strings, no browser time zone)
// ---------------------------------------------------------------------------

export function todayInShop(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parts(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return { year, month, day };
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const { year, month, day } = parts(ymd);
  return fromUtc(new Date(Date.UTC(year, month - 1, day + days)));
}

export function monthStart(ymd: string, offsetMonths = 0): string {
  const { year, month } = parts(ymd);
  return fromUtc(new Date(Date.UTC(year, month - 1 + offsetMonths, 1)));
}

export function monthEnd(ymd: string, offsetMonths = 0): string {
  const { year, month } = parts(ymd);
  return fromUtc(new Date(Date.UTC(year, month + offsetMonths, 0)));
}

export type ReportPreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "all"
  | "custom";

export const PRESET_LABELS: Array<{ id: Exclude<ReportPreset, "custom">; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "thisYear", label: "This year" },
  { id: "all", label: "All time" },
];

export function presetRange(
  preset: Exclude<ReportPreset, "custom">,
  today: string = todayInShop()
): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const day = addDays(today, -1);
      return { from: day, to: day };
    }
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "thisMonth":
      return { from: monthStart(today), to: today };
    case "lastMonth":
      return { from: monthStart(today, -1), to: monthEnd(today, -1) };
    case "thisYear":
      return { from: `${parts(today).year}-01-01`, to: today };
    case "all":
      return { from: "", to: "" };
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "27 Oct 2026" for a day, "Oct 2026" for a month. */
export function periodLabel(period: string, bucket: ReportBucket, withWeekday = false): string {
  const { year, month, day } = parts(period);
  if (bucket === "month") return `${MONTHS[month - 1]} ${year}`;
  const base = `${day} ${MONTHS[month - 1]} ${year}`;
  if (!withWeekday) return base;
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}, ${base}`;
}

export function rangeLabel(from: string, to: string): string {
  if (!from && !to) return "All time";
  if (from && to) {
    return from === to ? periodLabel(from, "day") : `${periodLabel(from, "day")} to ${periodLabel(to, "day")}`;
  }
  return from ? `From ${periodLabel(from, "day")}` : `Up to ${periodLabel(to, "day")}`;
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<ReportSource, string> = {
  ALL: "POS and online",
  POS: "POS only",
  ONLINE: "Online only",
};

export function sourceLabel(source: ReportSource) {
  return SOURCE_LABEL[source];
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Builds and downloads an .xlsx with a Summary sheet and a Daily or Monthly
 * sheet (with a totals row). Numbers are real numbers so Excel can sum them.
 */
export async function exportReportXlsx(args: {
  rows: ReportRow[];
  bucket: ReportBucket;
  filters: ReportFilters;
}) {
  const { rows, bucket, filters } = args;
  const XLSX = await import("xlsx");

  const gstOn = filters.gstPercent > 0;
  const totals = sumRows(rows);
  const margin = marginPercent(totals);
  const periodHeader = bucket === "day" ? "Date" : "Month";

  const header = [
    periodHeader,
    "Bills",
    "Pieces",
    gstOn ? "Sales incl. GST" : "Sales",
    ...(gstOn ? ["GST", "Net sales (excl. GST)"] : []),
    "Cost of goods",
    "Profit",
    "Margin %",
    "Sales with no cost price",
  ];

  const toLine = (label: string, row: ReportTotals) => {
    const rowMargin = marginPercent(row);
    return [
      label,
      row.bills,
      row.pieces,
      round2(row.gross),
      ...(gstOn ? [round2(row.gst), round2(row.net)] : []),
      round2(row.cost),
      round2(row.profit),
      rowMargin === null ? "" : round2(rowMargin),
      round2(row.netWithoutCost),
    ];
  };

  const sheetRows = [
    header,
    ...rows.map((row) => toLine(row.period.slice(0, bucket === "day" ? 10 : 7), row)),
    toLine("TOTAL", totals),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet["!cols"] = header.map((_, index) => ({ wch: index === 0 ? 14 : 18 }));

  const summary = XLSX.utils.aoa_to_sheet([
    ["Sales and profit report"],
    [],
    ["Period", rangeLabel(filters.from, filters.to)],
    ["Grouped by", bucket === "day" ? "Day" : "Month"],
    ["Channel", sourceLabel(filters.source)],
    ["GST", gstOn ? `Bill totals include ${filters.gstPercent}% GST, shown separately` : "Not separated"],
    ["Generated", new Date().toLocaleString("en-IN", { timeZone: SHOP_TIMEZONE })],
    [],
    ["Bills", totals.bills],
    ["Pieces sold", totals.pieces],
    [gstOn ? "Sales incl. GST" : "Sales", round2(totals.gross)],
    ...(gstOn
      ? [
          ["GST", round2(totals.gst)],
          ["Net sales (excl. GST)", round2(totals.net)],
        ]
      : []),
    ["Cost of goods", round2(totals.cost)],
    ["Profit", round2(totals.profit)],
    ["Margin %", margin === null ? "" : round2(margin)],
    ["Sales with no cost price (not in profit)", round2(totals.netWithoutCost)],
    [],
    [
      "Profit = net sales minus the cost price recorded when each piece was sold. " +
        "Pieces with no cost price are left out of profit and margin.",
    ],
  ]);
  summary["!cols"] = [{ wch: 40 }, { wch: 34 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, summary, "Summary");
  XLSX.utils.book_append_sheet(book, sheet, bucket === "day" ? "Daily sales" : "Monthly sales");

  const span = !filters.from && !filters.to ? "all-time" : `${filters.from || "start"}_to_${filters.to || "today"}`;
  XLSX.writeFile(book, `${bucket === "day" ? "daily" : "monthly"}-sales_${span}.xlsx`);
}
