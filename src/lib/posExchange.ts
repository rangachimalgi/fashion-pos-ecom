import type { SupabaseClient } from "@supabase/supabase-js";
import { toCheckoutError } from "@/lib/placeOrder";
import type { AdminOrder, PaymentMethod } from "@/types/order";

/** Matches the printed receipt: “Exchange Period : 2 days”. */
export const EXCHANGE_WINDOW_DAYS = 2;

export type ExchangeAvailability = {
  variant_id: string;
  quantity: number;
  already_returned: number;
  available: number;
  price_at_purchase: number;
};

export type ExchangeReturnLine = {
  variant_id: string;
  quantity: number;
};

export type ExchangeNewLine = {
  variant_id: string;
  quantity: number;
  unit_price: number;
};

export type ExchangeResult = {
  order_id: string;
  total_amount: number;
  credit: number;
  due: number;
};

function friendly(error: { code?: string; message: string }): Error {
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
    return new Error("Run supabase/migrations/031_pos_exchange.sql in the SQL Editor first.");
  }
  return toCheckoutError(error);
}

/** Pieces on a bill that can still be brought back. */
export async function fetchExchangeAvailability(
  supabase: SupabaseClient,
  orderId: string
): Promise<ExchangeAvailability[]> {
  const { data, error } = await supabase.rpc("pos_exchange_availability", {
    p_order_id: orderId,
  });
  if (error) throw friendly(error);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    variant_id: String(row.variant_id),
    quantity: Number(row.quantity),
    already_returned: Number(row.already_returned),
    available: Number(row.available),
    price_at_purchase: Number(row.price_at_purchase),
  }));
}

/** Shop-calendar day of a bill (YYYY-MM-DD). */
export function orderShopDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Last shop day this bill can be exchanged (inclusive). */
export function exchangeDeadline(order: Pick<AdminOrder, "created_at">, windowDays = EXCHANGE_WINDOW_DAYS): string | null {
  const day = orderShopDay(order.created_at);
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + windowDays));
  return date.toISOString().slice(0, 10);
}

export function canExchangeOrder(
  order: Pick<AdminOrder, "source" | "created_at">,
  todayShop: string,
  windowDays = EXCHANGE_WINDOW_DAYS
): { ok: true } | { ok: false; reason: string } {
  if (order.source !== "POS") return { ok: false, reason: "Only POS bills can be exchanged." };
  const deadline = exchangeDeadline(order, windowDays);
  if (!deadline) return { ok: false, reason: "This bill has no date." };
  if (todayShop > deadline) {
    return {
      ok: false,
      reason: `Exchange period is ${windowDays} day(s). This bill can no longer be exchanged.`,
    };
  }
  return { ok: true };
}

export function exchangeCredit(
  returns: ExchangeReturnLine[],
  availability: ExchangeAvailability[]
): number {
  const byId = new Map(availability.map((row) => [row.variant_id, row]));
  let credit = 0;
  for (const line of returns) {
    if (line.quantity <= 0) continue;
    const row = byId.get(line.variant_id);
    if (!row) continue;
    credit += row.price_at_purchase * line.quantity;
  }
  return Math.round(credit * 100) / 100;
}

/** Post the exchange. New items must cover the credit (no cash refund). */
export async function exchangePosOrder(
  supabase: SupabaseClient,
  args: {
    originalOrderId: string;
    returns: ExchangeReturnLine[];
    newItems: ExchangeNewLine[];
    payment_method: PaymentMethod;
    sales_person_id?: string | null;
    cash_received?: Record<string, number> | null;
    cash_change?: Record<string, number> | null;
  }
): Promise<ExchangeResult> {
  const returns = args.returns.filter((line) => line.quantity > 0);
  if (!returns.length) throw new Error("Pick at least one piece to bring back.");
  if (!args.newItems.length) throw new Error("Scan the new items the customer is taking.");

  const { data, error } = await supabase.rpc("exchange_pos_order", {
    p_original_order_id: args.originalOrderId,
    p_returns: returns,
    p_new_items: args.newItems.map((line) => ({
      variant_id: line.variant_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
    })),
    p_payment_method: args.payment_method,
    p_sales_person_id: args.sales_person_id ?? null,
    p_cash_received: args.payment_method === "CASH" ? (args.cash_received ?? null) : null,
    p_cash_change: args.payment_method === "CASH" ? (args.cash_change ?? null) : null,
    p_window_days: EXCHANGE_WINDOW_DAYS,
  });
  if (error) throw friendly(error);

  const row = data as Record<string, unknown>;
  return {
    order_id: String(row.order_id),
    total_amount: Number(row.total_amount),
    credit: Number(row.credit),
    due: Number(row.due),
  };
}
