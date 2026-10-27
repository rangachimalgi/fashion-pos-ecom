import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckoutRequest, CheckoutResponse, PaymentMethod, OrderSource } from "@/types/order";
import { normalizedShipping, validateShipping } from "@/lib/shipping";

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "UPI"];
const ORDER_SOURCES: OrderSource[] = ["ONLINE", "POS"];

/** An error with the HTTP status the API layer should answer with. */
export class CheckoutError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 500 = 400
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

/** Maps the Postgres error codes raised by supabase/migrations/013 to HTTP statuses. */
export function statusFromDbError(error: { code?: string; message: string }): CheckoutError["status"] {
  switch (error.code) {
    case "PT400":
      return 400;
    case "PT403":
      return 403;
    case "PT404":
      return 404;
    case "PT409":
      return 409;
    case "42501":
      return 403;
    default:
      return 500;
  }
}

export function toCheckoutError(error: { code?: string; message: string }) {
  const lower = error.message.toLowerCase();
  const missingFn =
    error.code === "PGRST202" ||
    (lower.includes("function") && lower.includes("could not find"));
  const hint = missingFn
    ? "\n\nRun supabase/migrations 013 and 014 in the Supabase SQL Editor."
    : "";
  return new CheckoutError(error.message + hint, statusFromDbError(error));
}

/**
 * Places an order through the `place_order` Postgres function, which runs the
 * stock check, stock decrement and order insert in ONE transaction with row
 * locks. Prices always come from the database; only a signed-in staff user
 * posting a POS bill may send a discounted `unit_price` (never above MRP).
 *
 * - Online checkout: call with the service-role client from /api/checkout.
 * - POS: call with the signed-in staff user's browser client.
 */
export async function placeOrder(
  supabase: SupabaseClient,
  body: CheckoutRequest
): Promise<CheckoutResponse> {
  const { payment_method, source, items, shipping } = body;

  if (!PAYMENT_METHODS.includes(payment_method)) {
    throw new CheckoutError("payment_method must be CASH or UPI");
  }
  if (!ORDER_SOURCES.includes(source)) {
    throw new CheckoutError("source must be ONLINE or POS");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new CheckoutError("Cart is empty");
  }

  const lines = items.map((item) => ({
    variant_id: String(item.variant_id ?? ""),
    quantity: Number(item.quantity),
    ...(item.unit_price == null ? {} : { unit_price: Number(item.unit_price) }),
  }));

  if (lines.some((line) => !line.variant_id || !Number.isInteger(line.quantity) || line.quantity < 1)) {
    throw new CheckoutError("Each item needs a variant_id and a quantity of 1+");
  }

  let delivery: ReturnType<typeof normalizedShipping> | null = null;
  if (source === "ONLINE") {
    if (!shipping) throw new CheckoutError("Add a delivery name, phone, and address.");
    const shippingError = validateShipping(shipping);
    if (shippingError) throw new CheckoutError(shippingError);
    delivery = normalizedShipping(shipping);
  }

  const { data, error } = await supabase.rpc("place_order", {
    p_payment_method: payment_method,
    p_source: source,
    p_items: lines,
    p_shipping: delivery,
  });

  if (error) throw toCheckoutError(error);

  const result = data as { order_id: string; total_amount: number | string };
  return {
    order_id: result.order_id,
    total_amount: Number(result.total_amount),
  };
}
