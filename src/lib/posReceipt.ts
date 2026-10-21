import type { CartItem } from "@/store/useCartStore";
import type { AdminOrder } from "@/types/order";
import { posLineTotal } from "@/lib/posPricing";
import { STORE_RECEIPT } from "@/lib/storeReceipt";

export type ReceiptLine = {
  sl: number;
  code: string;
  desc: string;
  qty: number;
  rate: number;
  value: number;
  discountPercent: number;
};

export type PosReceipt = {
  billNo: string;
  dateLabel: string;
  timeLabel: string;
  attendedBy: string;
  payment: string;
  lines: ReceiptLine[];
  itemCount: number;
  total: number;
  discount: number;
  netAmount: number;
  taxable: number;
  cgst: number;
  sgst: number;
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatReceiptBillNo(orderId: string, at = new Date()) {
  const serial = orderId.replace(/-/g, "").slice(-4).toUpperCase();
  return `${at.getFullYear()}/1/${serial}`;
}

export function buildPosReceipt(
  ticket: CartItem[],
  options: {
    orderId: string;
    payment: string;
    attendedBy: string;
    at?: Date;
  }
): PosReceipt {
  const at = options.at ?? new Date();
  const lines = ticket.map((item, index) => {
    const rate = Number(item.product.base_price);
    const value = posLineTotal(rate, item.quantity, item.discountPercent ?? 0);
    return {
      sl: index + 1,
      code: item.variant.barcode || item.product.style_code || "—",
      desc: item.product.name,
      qty: item.quantity,
      rate,
      value,
      discountPercent: item.discountPercent ?? 0,
    };
  });

  const total = money(lines.reduce((sum, line) => sum + line.rate * line.qty, 0));
  const netAmount = money(lines.reduce((sum, line) => sum + line.value, 0));
  const discount = money(total - netAmount);
  const gstRate = (STORE_RECEIPT.cgstRate + STORE_RECEIPT.sgstRate) / 100;
  const taxable = gstRate > 0 ? money(netAmount / (1 + gstRate)) : netAmount;
  const cgst = money(taxable * (STORE_RECEIPT.cgstRate / 100));
  const sgst = money(taxable * (STORE_RECEIPT.sgstRate / 100));

  const dd = String(at.getDate()).padStart(2, "0");
  const mm = String(at.getMonth() + 1).padStart(2, "0");
  const yy = String(at.getFullYear()).slice(-2);
  const hh = String(at.getHours()).padStart(2, "0");
  const min = String(at.getMinutes()).padStart(2, "0");

  return {
    billNo: formatReceiptBillNo(options.orderId, at),
    dateLabel: `${dd}/${mm}/${yy}`,
    timeLabel: `${hh}:${min}`,
    attendedBy: options.attendedBy,
    payment: options.payment,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
    total,
    discount,
    netAmount,
    taxable,
    cgst,
    sgst,
  };
}

export function buildPosReceiptFromOrder(
  order: AdminOrder,
  attendedBy: string
): PosReceipt {
  const at = order.created_at ? new Date(order.created_at) : new Date();
  const lines = order.items.map((item, index) => {
    const value = money(Number(item.price_at_purchase) * item.quantity);
    const mrp = Number(item.base_price);
    const rate = Number.isFinite(mrp) && mrp > 0 ? mrp : Number(item.price_at_purchase);
    const unit = Number(item.price_at_purchase);
    const discountPercent =
      rate > 0 && unit < rate ? money(((rate - unit) / rate) * 100) : 0;
    return {
      sl: index + 1,
      code: item.barcode || item.style_code || "—",
      desc: item.product_name || "Item",
      qty: item.quantity,
      rate,
      value,
      discountPercent,
    };
  });

  const total = money(lines.reduce((sum, line) => sum + line.rate * line.qty, 0));
  const netAmount = money(
    lines.reduce((sum, line) => sum + line.value, 0) || Number(order.total_amount)
  );
  const discount = money(Math.max(0, total - netAmount));
  const gstRate = (STORE_RECEIPT.cgstRate + STORE_RECEIPT.sgstRate) / 100;
  const taxable = gstRate > 0 ? money(netAmount / (1 + gstRate)) : netAmount;
  const cgst = money(taxable * (STORE_RECEIPT.cgstRate / 100));
  const sgst = money(taxable * (STORE_RECEIPT.sgstRate / 100));

  const dd = String(at.getDate()).padStart(2, "0");
  const mm = String(at.getMonth() + 1).padStart(2, "0");
  const yy = String(at.getFullYear()).slice(-2);
  const hh = String(at.getHours()).padStart(2, "0");
  const min = String(at.getMinutes()).padStart(2, "0");

  return {
    billNo: formatReceiptBillNo(order.id, at),
    dateLabel: `${dd}/${mm}/${yy}`,
    timeLabel: `${hh}:${min}`,
    attendedBy,
    payment: String(order.payment_method),
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
    total,
    discount,
    netAmount,
    taxable,
    cgst,
    sgst,
  };
}
