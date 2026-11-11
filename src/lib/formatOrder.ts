import type { AdminOrder } from "@/types/order";

export function formatInr(amount: number) {
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

/** Rupees with paise only when there are any: ₹1,299 or ₹1,536.50. */
export function formatMoney(amount: number) {
  const value = Number(amount);
  const hasPaise = Math.abs(value * 100 - Math.round(value) * 100) > 0.5;
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatOrderTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function shortOrderId(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function sourceLabel(source: AdminOrder["source"]) {
  if (source === "POS") return "POS";
  if (source === "ONLINE") return "Online";
  return String(source);
}

export function paymentLabel(
  method: AdminOrder["payment_method"],
  source?: AdminOrder["source"]
) {
  if (method === "CASH" && source === "ONLINE") return "Cash on delivery";
  if (method === "CASH") return "Cash";
  if (method === "UPI") return "UPI";
  return String(method);
}
