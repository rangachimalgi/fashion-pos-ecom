import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderSource } from "@/types/order";
import { toCheckoutError } from "@/lib/placeOrder";

export type CouponKind = "PERCENT" | "FLAT";
export type CouponChannel = "ALL" | "ONLINE" | "POS";

export type Coupon = {
  id: string;
  code: string;
  description: string;
  kind: CouponKind;
  value: number;
  max_discount: number | null;
  min_order: number;
  starts_on: string | null;
  ends_on: string | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  channel: CouponChannel;
  active: boolean;
  created_at: string;
};

export type CouponStats = {
  uses: number;
  discount_total: number;
  sales_total: number;
  last_used: string | null;
};

export type CouponInput = Omit<Coupon, "id" | "created_at">;

/** What the bag / POS keeps after a code is accepted. */
export type AppliedCoupon = {
  code: string;
  description: string;
  kind: CouponKind;
  value: number;
  max_discount: number | null;
  min_order: number;
};

export const CHANNEL_LABEL: Record<CouponChannel, string> = {
  ALL: "Online + store",
  ONLINE: "Online only",
  POS: "Store only",
};

const MIGRATION_HINT = "Run supabase/migrations/036_coupons.sql in the Supabase SQL Editor first.";

function isMissing(error: { code?: string; message: string }) {
  const lower = error.message.toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (lower.includes("coupon") && (lower.includes("could not find") || lower.includes("does not exist")))
  );
}

function friendly(error: { code?: string; message: string }) {
  if (isMissing(error)) return new Error(MIGRATION_HINT);
  if (error.code === "23505") return new Error("A coupon with that code already exists.");
  return toCheckoutError(error);
}

export function normalizeCouponCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20);
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Same maths as public._coupon_quote (whole-rupee percent discount). */
export function couponDiscount(coupon: AppliedCoupon, subtotal: number) {
  if (subtotal <= 0 || subtotal < coupon.min_order) return 0;
  let discount =
    coupon.kind === "PERCENT" ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  if (coupon.kind === "PERCENT" && coupon.max_discount != null) {
    discount = Math.min(discount, coupon.max_discount);
  }
  return Math.max(0, Math.min(discount, subtotal));
}

/**
 * Same split as public._apply_coupon: every unit price is reduced in proportion,
 * rounded to paise. Returns the unit prices and the bill total.
 */
export function couponPricedLines(
  lines: { mrp: number; quantity: number }[],
  coupon: AppliedCoupon
) {
  const subtotal = Math.round(lines.reduce((sum, line) => sum + line.mrp * line.quantity, 0) * 100) / 100;
  const discount = couponDiscount(coupon, subtotal);
  const units = lines.map((line) =>
    discount > 0 && subtotal > 0
      ? Math.round(((line.mrp * (subtotal - discount)) / subtotal) * 100) / 100
      : line.mrp
  );
  const total =
    Math.round(units.reduce((sum, unit, index) => sum + unit * lines[index].quantity, 0) * 100) / 100;
  return { subtotal, units, total, discount: Math.round((subtotal - total) * 100) / 100 };
}

export function describeCoupon(coupon: Pick<Coupon, "kind" | "value" | "max_discount" | "min_order">) {
  const off =
    coupon.kind === "PERCENT"
      ? `${coupon.value}% off${coupon.max_discount != null ? ` (up to ₹${coupon.max_discount})` : ""}`
      : `₹${coupon.value} off`;
  return coupon.min_order > 0 ? `${off} on ₹${coupon.min_order}+` : off;
}

/** Throws a friendly message when the code can't be used for this bill. */
export async function checkCoupon(
  supabase: SupabaseClient,
  input: { code: string; source: OrderSource; subtotal: number; phone?: string | null }
): Promise<AppliedCoupon & { discount: number }> {
  const code = normalizeCouponCode(input.code);
  if (!code) throw new Error("Enter a coupon code.");
  const { data, error } = await supabase.rpc("check_coupon", {
    p_code: code,
    p_source: input.source,
    p_subtotal: input.subtotal,
    p_phone: input.phone || null,
  });
  if (error) throw friendly(error);
  const row = data as Record<string, unknown>;
  return {
    code: String(row.code),
    description: String(row.description ?? ""),
    kind: row.kind === "FLAT" ? "FLAT" : "PERCENT",
    value: Number(row.value),
    max_discount: num(row.max_discount),
    min_order: Number(row.min_order ?? 0),
    discount: Number(row.discount ?? 0),
  };
}

function toCoupon(row: Record<string, unknown>): Coupon {
  return {
    id: String(row.id),
    code: String(row.code),
    description: String(row.description ?? ""),
    kind: row.kind === "FLAT" ? "FLAT" : "PERCENT",
    value: Number(row.value),
    max_discount: num(row.max_discount),
    min_order: Number(row.min_order ?? 0),
    starts_on: row.starts_on ? String(row.starts_on) : null,
    ends_on: row.ends_on ? String(row.ends_on) : null,
    usage_limit: num(row.usage_limit),
    per_customer_limit: num(row.per_customer_limit),
    channel: (["ALL", "ONLINE", "POS"].includes(String(row.channel)) ? row.channel : "ALL") as CouponChannel,
    active: Boolean(row.active),
    created_at: String(row.created_at ?? ""),
  };
}

export async function listCoupons(supabase: SupabaseClient) {
  const [list, stats] = await Promise.all([
    supabase.from("coupons").select("*").order("created_at", { ascending: false }),
    supabase.rpc("coupon_stats"),
  ]);
  if (list.error) throw friendly(list.error);
  if (stats.error) throw friendly(stats.error);

  const byId = new Map<string, CouponStats>();
  for (const row of (stats.data ?? []) as Array<Record<string, unknown>>) {
    byId.set(String(row.coupon_id), {
      uses: Number(row.uses ?? 0),
      discount_total: Number(row.discount_total ?? 0),
      sales_total: Number(row.sales_total ?? 0),
      last_used: row.last_used ? String(row.last_used) : null,
    });
  }

  return ((list.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const coupon = toCoupon(row);
    return {
      coupon,
      stats: byId.get(coupon.id) ?? { uses: 0, discount_total: 0, sales_total: 0, last_used: null },
    };
  });
}

export function validateCouponInput(input: CouponInput): string | null {
  if (!/^[A-Z0-9_-]{3,20}$/.test(input.code)) {
    return "Code must be 3–20 letters, numbers, - or _.";
  }
  if (!(input.value > 0)) return "Enter how much off.";
  if (input.kind === "PERCENT" && input.value > 100) return "Percent off can't be more than 100.";
  if (input.max_discount != null && !(input.max_discount > 0)) return "Max discount must be more than ₹0.";
  if (input.min_order < 0) return "Minimum bill can't be negative.";
  if (input.starts_on && input.ends_on && input.ends_on < input.starts_on) {
    return "End date is before the start date.";
  }
  if (input.usage_limit != null && !(Number.isInteger(input.usage_limit) && input.usage_limit > 0)) {
    return "Total uses must be a whole number above 0.";
  }
  if (
    input.per_customer_limit != null &&
    !(Number.isInteger(input.per_customer_limit) && input.per_customer_limit > 0)
  ) {
    return "Uses per customer must be a whole number above 0.";
  }
  return null;
}

function toRow(input: CouponInput) {
  return {
    ...input,
    description: input.description.trim(),
    max_discount: input.kind === "PERCENT" ? input.max_discount : null,
    updated_at: new Date().toISOString(),
  };
}

export async function createCoupon(supabase: SupabaseClient, input: CouponInput) {
  const { error } = await supabase.from("coupons").insert(toRow(input));
  if (error) throw friendly(error);
}

export async function updateCoupon(supabase: SupabaseClient, id: string, input: CouponInput) {
  const { error } = await supabase.from("coupons").update(toRow(input)).eq("id", id);
  if (error) throw friendly(error);
}

export async function setCouponActive(supabase: SupabaseClient, id: string, active: boolean) {
  const { error } = await supabase
    .from("coupons")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw friendly(error);
}

export async function deleteCoupon(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("coupons").delete().eq("id", id);
  if (error) throw friendly(error);
}
