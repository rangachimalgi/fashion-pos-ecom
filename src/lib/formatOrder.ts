import type { AdminOrder } from "@/types/order";

export function formatInr(amount: number) {
  return `₹${Number(amount).toLocaleString("en-IN")}`;
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

export function paymentLabel(method: AdminOrder["payment_method"]) {
  if (method === "CASH") return "Cash";
  if (method === "UPI") return "UPI";
  return String(method);
}
