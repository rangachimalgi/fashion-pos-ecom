import type { SupabaseClient } from "@supabase/supabase-js";
import { toCheckoutError } from "@/lib/placeOrder";

// ---------------------------------------------------------------------------
// Pricing maths. These mirror supabase/migrations/019_purchases.sql, which
// does the same sums again on save (the database is the source of truth).
//
//   unit cost = rate - supplier discount + supplier GST      (landed cost)
//   MRP       = unit cost + profit %, rounded up to MRP_ROUND_STEP
// ---------------------------------------------------------------------------

export const MARKUP_PRESETS = [10, 15, 20, 25, 30, 35, 40, 50, 60, 75, 100];
export const GST_PRESETS = [0, 5, 12, 18];
/** MRPs are rounded UP to a multiple of this many rupees. */
export const MRP_ROUND_STEP = 5;

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** qty x rate less the supplier discount, before GST (the old software's "Value"). */
export function lineValue(qty: number, rate: number, discPercent: number) {
  return round2(qty * rate * (1 - discPercent / 100));
}

/** Cost of one piece including the supplier's discount and GST. */
export function unitCost(rate: number, discPercent: number, gstPercent: number) {
  return round2(rate * (1 - discPercent / 100) * (1 + gstPercent / 100));
}

/** Cost plus profit %, rounded up to the next MRP_ROUND_STEP rupees. */
export function suggestMrp(cost: number, markupPercent: number, step = MRP_ROUND_STEP) {
  const raw = round2(cost * (1 + markupPercent / 100));
  if (!(raw > 0)) return 0;
  return Math.ceil(raw / step - 1e-9) * step;
}

export type TotalsLine = { qty: number; rate: number; disc: number; gst: number };

export type PurchaseTotals = {
  pieces: number;
  gross: number;
  discount: number;
  netItems: number;
  gst: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  netInvoice: number;
};

export function purchaseTotals(lines: TotalsLine[], roundOff = 0): PurchaseTotals {
  let pieces = 0;
  let gross = 0;
  let net = 0;
  let gstRaw = 0;
  for (const line of lines) {
    const value = lineValue(line.qty, line.rate, line.disc);
    pieces += line.qty;
    gross += line.qty * line.rate;
    net += value;
    gstRaw += (value * line.gst) / 100;
  }
  const gst = round2(gstRaw);
  const cgst = round2(gst / 2);
  const netItems = round2(net);
  return {
    pieces,
    gross: round2(gross),
    discount: round2(round2(gross) - netItems),
    netItems,
    gst,
    cgst,
    sgst: round2(gst - cgst),
    roundOff,
    netInvoice: round2(netItems + gst + roundOff),
  };
}

// ---------------------------------------------------------------------------
// Suppliers and purchases (admin only; the database refuses everyone else)
// ---------------------------------------------------------------------------

export type Supplier = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  gstin: string | null;
};

function friendly(error: { code?: string; message: string }): Error {
  if (error.code === "PGRST202" || error.code === "42P01" || error.code === "PGRST205") {
    return new Error("Purchases are not set up yet. Run supabase/migrations/019_purchases.sql.");
  }
  return toCheckoutError(error);
}

export async function listSuppliers(supabase: SupabaseClient): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, code, address, phone, gstin")
    .order("name", { ascending: true });
  if (error) throw friendly(error);
  return (data ?? []) as Supplier[];
}

export async function saveSupplier(
  supabase: SupabaseClient,
  supplier: { name: string; address?: string; phone?: string; gstin?: string; code?: string }
): Promise<string> {
  const { data, error } = await supabase.rpc("save_supplier", {
    p_name: supplier.name,
    p_address: supplier.address ?? null,
    p_phone: supplier.phone ?? null,
    p_gstin: supplier.gstin ?? null,
    p_code: supplier.code ?? null,
  });
  if (error) throw friendly(error);
  return String(data);
}

export type PurchaseLineInput = {
  item_name: string;
  brand: string;
  design: string;
  department: string;
  category: string;
  color: string;
  size: string;
  hsn: string;
  qty: number;
  rate: number;
  disc_percent: number;
  gst_percent: number;
  markup_percent: number | null;
  mrp: number;
};

export type PurchaseHeaderInput = {
  supplier_id: string;
  supplier_invoice_no: string;
  supplier_invoice_date: string;
  entry_date: string;
  round_off: number;
  declared_total: number | null;
  notes: string;
};

export type SavedPurchase = {
  purchase_id: string;
  entry_no: number;
  total_pieces: number;
  net_invoice: number;
};

export async function savePurchase(
  supabase: SupabaseClient,
  header: PurchaseHeaderInput,
  items: PurchaseLineInput[]
): Promise<SavedPurchase> {
  const { data, error } = await supabase.rpc("save_purchase", {
    p_header: header,
    p_items: items,
  });
  if (error) throw friendly(error);
  const result = data as Record<string, unknown>;
  return {
    purchase_id: String(result.purchase_id),
    entry_no: Number(result.entry_no),
    total_pieces: Number(result.total_pieces),
    net_invoice: Number(result.net_invoice),
  };
}

export async function deletePurchase(supabase: SupabaseClient, purchaseId: string) {
  const { error } = await supabase.rpc("delete_purchase", { p_purchase_id: purchaseId });
  if (error) throw friendly(error);
}

export type PurchaseSummary = {
  id: string;
  entry_no: number;
  entry_date: string;
  supplier_name: string;
  supplier_invoice_no: string | null;
  supplier_invoice_date: string | null;
  total_pieces: number;
  net_invoice: number;
  declared_total: number | null;
};

export async function listPurchases(supabase: SupabaseClient, limit = 300): Promise<PurchaseSummary[]> {
  const { data, error } = await supabase
    .from("purchases")
    .select(
      "id, entry_no, entry_date, supplier_invoice_no, supplier_invoice_date, total_pieces, net_invoice, declared_total, suppliers(name)"
    )
    .order("entry_no", { ascending: false })
    .limit(limit);
  if (error) throw friendly(error);

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const supplier = row.suppliers as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(supplier) ? supplier[0]?.name : supplier?.name;
    return {
      id: String(row.id),
      entry_no: Number(row.entry_no),
      entry_date: String(row.entry_date),
      supplier_name: name ?? "—",
      supplier_invoice_no: (row.supplier_invoice_no as string | null) ?? null,
      supplier_invoice_date: (row.supplier_invoice_date as string | null) ?? null,
      total_pieces: Number(row.total_pieces),
      net_invoice: Number(row.net_invoice),
      declared_total: row.declared_total == null ? null : Number(row.declared_total),
    };
  });
}

export type PurchaseItemRow = {
  id: string;
  line_no: number;
  item_name: string;
  brand: string | null;
  design: string | null;
  department: string;
  category: string;
  color: string;
  size: string;
  hsn: string | null;
  qty: number;
  rate: number;
  disc_percent: number;
  gst_percent: number;
  line_value: number;
  unit_cost: number;
  markup_percent: number | null;
  mrp: number;
  barcode: string;
};

export type PurchaseDetail = PurchaseSummary & {
  gross_value: number;
  discount_amount: number;
  net_items: number;
  cgst: number;
  sgst: number;
  gst_total: number;
  round_off: number;
  notes: string | null;
  created_by_email: string | null;
  supplier: Supplier | null;
  items: PurchaseItemRow[];
};

export async function getPurchase(supabase: SupabaseClient, id: string): Promise<PurchaseDetail | null> {
  const { data, error } = await supabase
    .from("purchases")
    .select("*, suppliers(id, name, code, address, phone, gstin), purchase_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw friendly(error);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const supplierRaw = row.suppliers as Supplier | Supplier[] | null;
  const supplier = Array.isArray(supplierRaw) ? (supplierRaw[0] ?? null) : supplierRaw;
  const items = ((row.purchase_items ?? []) as Array<Record<string, unknown>>)
    .map((item) => ({
      id: String(item.id),
      line_no: Number(item.line_no),
      item_name: String(item.item_name),
      brand: (item.brand as string | null) ?? null,
      design: (item.design as string | null) ?? null,
      department: String(item.department),
      category: String(item.category),
      color: String(item.color),
      size: String(item.size),
      hsn: (item.hsn as string | null) ?? null,
      qty: Number(item.qty),
      rate: Number(item.rate),
      disc_percent: Number(item.disc_percent),
      gst_percent: Number(item.gst_percent),
      line_value: Number(item.line_value),
      unit_cost: Number(item.unit_cost),
      markup_percent: item.markup_percent == null ? null : Number(item.markup_percent),
      mrp: Number(item.mrp),
      barcode: String(item.barcode),
    }))
    .sort((a, b) => a.line_no - b.line_no);

  return {
    id: String(row.id),
    entry_no: Number(row.entry_no),
    entry_date: String(row.entry_date),
    supplier_name: supplier?.name ?? "—",
    supplier_invoice_no: (row.supplier_invoice_no as string | null) ?? null,
    supplier_invoice_date: (row.supplier_invoice_date as string | null) ?? null,
    total_pieces: Number(row.total_pieces),
    net_invoice: Number(row.net_invoice),
    declared_total: row.declared_total == null ? null : Number(row.declared_total),
    gross_value: Number(row.gross_value),
    discount_amount: Number(row.discount_amount),
    net_items: Number(row.net_items),
    cgst: Number(row.cgst),
    sgst: Number(row.sgst),
    gst_total: Number(row.gst_total),
    round_off: Number(row.round_off),
    notes: (row.notes as string | null) ?? null,
    created_by_email: (row.created_by_email as string | null) ?? null,
    supplier,
    items,
  };
}
