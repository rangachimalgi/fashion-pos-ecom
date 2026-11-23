import type { CartItem } from "@/store/useCartStore";
import type { AdminOrder } from "@/types/order";
import { posLineTotal } from "@/lib/posPricing";
import { STORE_RECEIPT } from "@/lib/storeReceipt";
import { couponPricedLines, type AppliedCoupon } from "@/lib/coupons";

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
  /** Set once the bill is posted (used to send it on WhatsApp / email). */
  orderId?: string | null;
  billNo: string;
  dateLabel: string;
  timeLabel: string;
  attendedBy: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  payment: string;
  lines: ReceiptLine[];
  itemCount: number;
  total: number;
  discount: number;
  netAmount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  /** Receipt T&Cs; when omitted the printer loads the current admin-saved list. */
  terms?: string[] | null;
  /** Set when this bill is an exchange. */
  exchangeOfBillNo?: string | null;
  exchangeCredit?: number | null;
  /** What the customer pays after credit (same as net when not an exchange). */
  amountDue?: number | null;
  /** Coupon used; its discount is already inside the line values and `discount`. */
  couponCode?: string | null;
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
    customerName?: string | null;
    customerPhone?: string | null;
    at?: Date;
    exchangeOfBillNo?: string | null;
    exchangeCredit?: number | null;
    amountDue?: number | null;
    /** Coupon bills are priced from MRP; manual line discounts are ignored. */
    coupon?: AppliedCoupon | null;
  }
): PosReceipt {
  const at = options.at ?? new Date();
  const couponUnits = options.coupon
    ? couponPricedLines(
        ticket.map((item) => ({ mrp: Number(item.product.base_price), quantity: item.quantity })),
        options.coupon
      ).units
    : null;
  const lines = ticket.map((item, index) => {
    const rate = Number(item.product.base_price);
    const unit = couponUnits?.[index];
    const value =
      unit != null ? money(unit * item.quantity) : posLineTotal(rate, item.quantity, item.discountPercent ?? 0);
    const discountPercent =
      unit != null
        ? rate > 0 && unit < rate
          ? money(((rate - unit) / rate) * 100)
          : 0
        : item.discountPercent ?? 0;
    return {
      sl: index + 1,
      code: item.variant.barcode || item.product.style_code || "—",
      desc: item.product.name,
      qty: item.quantity,
      rate,
      value,
      discountPercent,
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
    orderId: options.orderId === "preview" ? null : options.orderId,
    billNo: formatReceiptBillNo(options.orderId, at),
    dateLabel: `${dd}/${mm}/${yy}`,
    timeLabel: `${hh}:${min}`,
    attendedBy: options.attendedBy,
    customerName: options.customerName?.trim() || null,
    customerPhone: options.customerPhone?.trim() || null,
    payment: options.payment,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
    total,
    discount,
    netAmount,
    taxable,
    cgst,
    sgst,
    exchangeOfBillNo: options.exchangeOfBillNo ?? null,
    exchangeCredit: options.exchangeCredit ?? null,
    amountDue: options.amountDue ?? null,
    couponCode: options.coupon?.code ?? null,
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
    orderId: order.id,
    billNo: formatReceiptBillNo(order.id, at),
    dateLabel: `${dd}/${mm}/${yy}`,
    timeLabel: `${hh}:${min}`,
    attendedBy,
    customerName: order.shipping?.customer_name?.trim() || null,
    customerPhone: order.shipping?.customer_phone?.trim() || null,
    payment: String(order.payment_method),
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
    total,
    discount,
    netAmount,
    taxable,
    cgst,
    sgst,
    exchangeOfBillNo: order.exchange_of ? formatReceiptBillNo(order.exchange_of, at) : null,
    exchangeCredit: null,
    amountDue: null,
    couponCode: order.coupon_code ?? null,
  };
}
