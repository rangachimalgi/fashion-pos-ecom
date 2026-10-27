import type { CheckoutResponse, ShippingDetails } from "@/types/order";

/** Browser helper for the public online checkout (POST /api/checkout). */
export async function submitOnlineOrder(input: {
  payment_method: "CASH" | "UPI";
  items: Array<{ variant_id: string; quantity: number }>;
  shipping: ShippingDetails;
}): Promise<CheckoutResponse> {
  const response = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, source: "ONLINE" }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (Partial<CheckoutResponse> & { error?: string })
    | null;

  if (!response.ok || !payload?.order_id) {
    throw new Error(payload?.error ?? "Checkout failed. Please try again.");
  }

  return { order_id: payload.order_id, total_amount: Number(payload.total_amount) };
}
