import type { SupabaseClient } from "@supabase/supabase-js";
import { describeCoupon, type CouponKind } from "@/lib/coupons";
import { toCheckoutError } from "@/lib/placeOrder";
import { STORE_RECEIPT } from "@/lib/storeReceipt";

export type MessageKind = "BILL" | "BIRTHDAY" | "ANNIVERSARY" | "OFFER";
export type MessageChannel = "WHATSAPP" | "EMAIL";

export const MESSAGE_KINDS: MessageKind[] = ["BILL", "BIRTHDAY", "ANNIVERSARY", "OFFER"];

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
  BILL: "Bill",
  BIRTHDAY: "Birthday",
  ANNIVERSARY: "Anniversary",
  OFFER: "Offer",
};

export const SHOP_NAME = "Eshwari Vastra";

export type MessageTemplate = {
  kind: MessageKind;
  whatsapp_body: string;
  email_subject: string;
  email_body: string;
  coupon_enabled: boolean;
  coupon_kind: CouponKind;
  coupon_value: number;
  coupon_max_discount: number | null;
  coupon_min_order: number;
  coupon_valid_days: number;
  offer_coupon_code: string | null;
};

export type IssuedCoupon = {
  code: string;
  description: string;
  kind: CouponKind;
  value: number;
  max_discount: number | null;
  min_order: number;
  ends_on: string | null;
};

export type CustomerProfile = {
  phone: string;
  name: string;
  email: string | null;
  birthday: string | null;
  anniversary: string | null;
  marketing_opt_in: boolean;
};

/** Bill details used by the BILL template. */
export type BillSummary = {
  orderId: string;
  billNo: string;
  dateLabel: string;
  lines: { desc: string; qty: number; value: number }[];
  total: number;
  saved: number;
};

export const TEMPLATE_PLACEHOLDERS: { key: string; help: string }[] = [
  { key: "name", help: "Customer's first name" },
  { key: "shop", help: "Shop name" },
  { key: "bill_no", help: "Bill number (bill only)" },
  { key: "date", help: "Bill date (bill only)" },
  { key: "items", help: "One line per item (bill only)" },
  { key: "total", help: "Bill total (bill only)" },
  { key: "saved", help: "Discount on the bill (line is hidden when 0)" },
  { key: "coupon", help: "Coupon code" },
  { key: "coupon_offer", help: "e.g. 10% off (up to ₹500) on ₹1000+" },
  { key: "coupon_expiry", help: "Last day the coupon works" },
];

const MIGRATION_HINT = "Run supabase/migrations/037_customers_messaging.sql in the Supabase SQL Editor first.";

function friendly(error: { code?: string; message: string }) {
  const lower = error.message.toLowerCase();
  if (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    (lower.includes("could not find") && /customer|message|coupon/.test(lower))
  ) {
    return new Error(MIGRATION_HINT);
  }
  return toCheckoutError(error);
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const inr = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function prettyDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function firstName(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "there";
}

export function messageVars(input: {
  name: string;
  bill?: BillSummary | null;
  coupon?: IssuedCoupon | null;
}): Record<string, string> {
  const { bill, coupon } = input;
  return {
    name: firstName(input.name),
    shop: SHOP_NAME,
    bill_no: bill?.billNo ?? "",
    date: bill?.dateLabel ?? "",
    items: bill
      ? bill.lines.map((line) => `• ${line.desc} × ${line.qty} — ₹${inr(line.value)}`).join("\n")
      : "",
    total: bill ? inr(bill.total) : "",
    saved: bill && bill.saved > 0 ? inr(bill.saved) : "",
    coupon: coupon?.code ?? "",
    coupon_offer: coupon ? describeCoupon(coupon) : "",
    coupon_expiry: coupon?.ends_on ? prettyDate(coupon.ends_on) : "",
  };
}

/**
 * Fills {placeholders}. A line that uses a placeholder with no value (no coupon,
 * nothing saved…) is dropped, so templates don't need if/else.
 */
export function renderTemplate(body: string, vars: Record<string, string>) {
  const kept = body.split("\n").filter((line) => {
    const used = [...line.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]);
    return used.every((key) => !(key in vars) || vars[key] !== "");
  });
  return kept
    .join("\n")
    .replace(/\{([a-z_]+)\}/g, (whole, key: string) => (key in vars ? vars[key] : whole))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Opens a WhatsApp chat (app or WhatsApp Web) with the text filled in. */
export function whatsappUrl(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&#39;"
  );
}

export type OccasionCoupon = IssuedCoupon & { occasion: "BIRTHDAY" | "ANNIVERSARY" };

/** Coupons to add to a bill message in the customer's birthday / anniversary month. */
export async function billOccasionCoupons(supabase: SupabaseClient, phone: string): Promise<OccasionCoupon[]> {
  const { data, error } = await supabase.rpc("bill_occasion_coupons", { p_phone: phone });
  if (error) return [];
  return parseOccasionCoupons(data);
}

export function parseOccasionCoupons(data: unknown): OccasionCoupon[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      const coupon = toIssuedCoupon(row);
      const occasion = (row as Record<string, unknown>)?.occasion;
      return coupon && (occasion === "BIRTHDAY" || occasion === "ANNIVERSARY") ? { ...coupon, occasion } : null;
    })
    .filter((row): row is OccasionCoupon => Boolean(row));
}

/** Adds "it's your birthday month" lines before the closing line of a bill message. */
export function withOccasionCoupons(text: string, extras: OccasionCoupon[]) {
  if (!extras.length) return text;
  const lines = extras.map((coupon) => {
    const until = coupon.ends_on ? ` Valid till ${prettyDate(coupon.ends_on)}.` : "";
    return coupon.occasion === "BIRTHDAY"
      ? `🎂 It's your birthday month! A birthday gift too: use *${coupon.code}* for ${describeCoupon(coupon)}.${until}`
      : `💐 Happy anniversary month! An anniversary gift too: use *${coupon.code}* for ${describeCoupon(coupon)}.${until}`;
  });
  const blocks = text.split(/\n{2,}/);
  if (blocks.length > 1) blocks.splice(blocks.length - 1, 0, lines.join("\n"));
  else blocks.push(lines.join("\n"));
  return blocks.join("\n\n");
}

/** WhatsApp *bold* markers read as stray asterisks in email. */
export function plainForEmail(text: string) {
  return text.replace(/\*([^*\n]+)\*/g, "$1");
}

export type EmailCouponBox = { label: string; coupon: IssuedCoupon };

/** Simple branded HTML email from the plain-text body. */
export function emailHtml(text: string, boxes: EmailCouponBox[] = []) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const couponBox = boxes
    .map(
      ({ label, coupon }) => `<div style="margin:14px 0;padding:16px;border:1.5px dashed #C79242;border-radius:12px;text-align:center">
         <div style="font-size:12px;letter-spacing:2px;color:#8a6a3a">${escapeHtml(label.toUpperCase())}</div>
         <div style="font-size:24px;font-weight:700;letter-spacing:3px;color:#1f1f1f;margin-top:4px">${escapeHtml(coupon.code)}</div>
         <div style="font-size:13px;color:#555;margin-top:4px">${escapeHtml(describeCoupon(coupon))}${
           coupon.ends_on ? ` · valid till ${escapeHtml(prettyDate(coupon.ends_on))}` : ""
         }</div>
       </div>`
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:Georgia,'Times New Roman',serif">
  <div style="max-width:520px;margin:0 auto;padding:28px 16px">
    <div style="background:#fff;border-radius:16px;padding:28px 24px;color:#222;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-family:Georgia,serif;font-size:13px;letter-spacing:3px;color:#8a6a3a">HOUSE OF ESHWARI</div>
        <div style="font-family:Georgia,serif;font-size:26px;letter-spacing:4px;color:#1f1f1f">VASTRA</div>
      </div>
      ${paragraphs}
      ${couponBox}
      <p style="margin:20px 0 0;font-size:12px;color:#888;text-align:center">
        ${escapeHtml(STORE_RECEIPT.addressLines.join(", "))} · ${escapeHtml(STORE_RECEIPT.phone)}
      </p>
    </div>
  </div></body></html>`;
}

function toTemplate(row: Record<string, unknown>): MessageTemplate {
  return {
    kind: String(row.kind) as MessageKind,
    whatsapp_body: String(row.whatsapp_body ?? ""),
    email_subject: String(row.email_subject ?? ""),
    email_body: String(row.email_body ?? ""),
    coupon_enabled: Boolean(row.coupon_enabled),
    coupon_kind: row.coupon_kind === "FLAT" ? "FLAT" : "PERCENT",
    coupon_value: Number(row.coupon_value ?? 0),
    coupon_max_discount: num(row.coupon_max_discount),
    coupon_min_order: Number(row.coupon_min_order ?? 0),
    coupon_valid_days: Number(row.coupon_valid_days ?? 30),
    offer_coupon_code: row.offer_coupon_code ? String(row.offer_coupon_code) : null,
  };
}

export async function listTemplates(supabase: SupabaseClient): Promise<MessageTemplate[]> {
  const { data, error } = await supabase.from("message_templates").select("*");
  if (error) throw friendly(error);
  const rows = ((data ?? []) as Array<Record<string, unknown>>).map(toTemplate);
  return MESSAGE_KINDS.map((kind) => rows.find((row) => row.kind === kind)).filter(
    (row): row is MessageTemplate => Boolean(row)
  );
}

export async function getTemplate(supabase: SupabaseClient, kind: MessageKind) {
  const { data, error } = await supabase.from("message_templates").select("*").eq("kind", kind).maybeSingle();
  if (error) throw friendly(error);
  if (!data) throw new Error(MIGRATION_HINT);
  return toTemplate(data as Record<string, unknown>);
}

export async function saveTemplate(supabase: SupabaseClient, template: MessageTemplate) {
  const { kind, ...rest } = template;
  const { error } = await supabase
    .from("message_templates")
    .update({
      ...rest,
      coupon_max_discount: rest.coupon_kind === "PERCENT" ? rest.coupon_max_discount : null,
      offer_coupon_code: kind === "OFFER" ? rest.offer_coupon_code?.trim().toUpperCase() || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq("kind", kind);
  if (error) throw friendly(error);
}

export function toIssuedCoupon(data: unknown): IssuedCoupon | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return {
    code: String(row.code),
    description: String(row.description ?? ""),
    kind: row.kind === "FLAT" ? "FLAT" : "PERCENT",
    value: Number(row.value),
    max_discount: num(row.max_discount),
    min_order: Number(row.min_order ?? 0),
    ends_on: row.ends_on ? String(row.ends_on) : null,
  };
}

/** Staff: BILL coupons. Admin: any kind. Re-sending returns the same code. */
export async function issueCustomerCoupon(
  supabase: SupabaseClient,
  kind: MessageKind,
  phone: string,
  orderId?: string | null
) {
  const { data, error } = await supabase.rpc("issue_customer_coupon", {
    p_kind: kind,
    p_phone: phone,
    p_order_id: orderId ?? null,
  });
  if (error) throw friendly(error);
  return toIssuedCoupon(data);
}

export async function logMessage(
  supabase: SupabaseClient,
  entry: {
    kind: MessageKind;
    channel: MessageChannel;
    phone?: string | null;
    email?: string | null;
    name?: string | null;
    orderId?: string | null;
    couponCode?: string | null;
    status: "OPENED" | "SENT" | "FAILED";
    error?: string | null;
  }
) {
  await supabase.rpc("log_message", {
    p_kind: entry.kind,
    p_channel: entry.channel,
    p_phone: entry.phone ?? null,
    p_email: entry.email ?? null,
    p_customer_name: entry.name ?? null,
    p_order_id: entry.orderId ?? null,
    p_coupon_code: entry.couponCode ?? null,
    p_status: entry.status,
    p_error: entry.error ?? null,
  });
}

/**
 * Builds the WhatsApp text (issuing the coupon first), opens the chat and logs it.
 * Opens the tab synchronously so the browser doesn't block it as a popup.
 */
export async function openWhatsAppMessage(
  supabase: SupabaseClient,
  input: { kind: MessageKind; phone: string; name: string; bill?: BillSummary | null }
) {
  const popup = window.open("about:blank", "_blank");
  try {
    const template = await getTemplate(supabase, input.kind);
    const coupon = await issueCustomerCoupon(supabase, input.kind, input.phone, input.bill?.orderId);
    const extras = input.kind === "BILL" ? await billOccasionCoupons(supabase, input.phone) : [];
    const text = withOccasionCoupons(
      renderTemplate(template.whatsapp_body, messageVars({ name: input.name, bill: input.bill, coupon })),
      extras
    );
    const url = whatsappUrl(input.phone, text);
    if (popup) popup.location.href = url;
    else window.location.href = url;
    await logMessage(supabase, {
      kind: input.kind,
      channel: "WHATSAPP",
      phone: input.phone,
      name: input.name,
      orderId: input.bill?.orderId,
      couponCode: [coupon?.code, ...extras.map((extra) => extra.code)].filter(Boolean).join(", ") || null,
      status: "OPENED",
    });
    return coupon;
  } catch (err) {
    popup?.close();
    throw err;
  }
}

/** Sends through /api/messages/email (Gmail SMTP on the server). */
export async function sendEmailMessage(
  supabase: SupabaseClient,
  input: { kind: MessageKind; phone: string; email?: string | null; orderId?: string | null }
) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has ended. Please sign in again.");
  const response = await fetch("/api/messages/email", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await response.json().catch(() => ({}))) as { error?: string; to?: string; coupon?: string | null };
  if (!response.ok) throw new Error(json.error ?? "Email could not be sent");
  return json;
}

export function toCustomer(row: Record<string, unknown> | null | undefined): CustomerProfile | null {
  if (!row || !row.phone) return null;
  return {
    phone: String(row.phone),
    name: String(row.name ?? ""),
    email: row.email ? String(row.email) : null,
    birthday: row.birthday ? String(row.birthday) : null,
    anniversary: row.anniversary ? String(row.anniversary) : null,
    marketing_opt_in: Boolean(row.marketing_opt_in),
  };
}

export async function getCustomer(supabase: SupabaseClient, phone: string) {
  const { data, error } = await supabase.rpc("get_customer", { p_phone: phone });
  if (error) throw friendly(error);
  return toCustomer(data as Record<string, unknown> | null);
}

export async function saveCustomer(
  supabase: SupabaseClient,
  input: {
    phone: string;
    name: string;
    email?: string | null;
    birthday?: string | null;
    anniversary?: string | null;
    optIn?: boolean | null;
  }
) {
  const { error } = await supabase.rpc("save_customer", {
    p_phone: input.phone,
    p_name: input.name,
    p_email: input.email || null,
    p_birthday: input.birthday || null,
    p_anniversary: input.anniversary || null,
    p_opt_in: input.optIn ?? null,
  });
  if (error) throw friendly(error);
}

export function validateEmail(email: string) {
  const value = email.trim();
  if (!value) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? null : "Enter a valid email address.";
}

export function billFromReceipt(receipt: {
  orderId?: string | null;
  billNo: string;
  dateLabel: string;
  lines: { desc: string; qty: number; value: number }[];
  netAmount: number;
  discount: number;
}): BillSummary | null {
  if (!receipt.orderId) return null;
  return {
    orderId: receipt.orderId,
    billNo: receipt.billNo,
    dateLabel: receipt.dateLabel,
    lines: receipt.lines.map((line) => ({ desc: line.desc, qty: line.qty, value: line.value })),
    total: receipt.netAmount,
    saved: receipt.discount,
  };
}
