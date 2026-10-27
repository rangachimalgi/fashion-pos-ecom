import type { SupabaseClient } from "@supabase/supabase-js";
import { toCheckoutError } from "@/lib/placeOrder";

export type DeleteRequestStatus = "pending" | "approved" | "rejected";

export type DeleteRequestItem = {
  product_name: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  price_at_purchase: number;
};

export type DeleteRequest = {
  id: string;
  order_id: string | null;
  order_snapshot: {
    order_id: string;
    created_at: string | null;
    total_amount: number;
    payment_method: string;
    items: DeleteRequestItem[];
  };
  reason: string;
  status: DeleteRequestStatus;
  requested_by_email: string | null;
  requested_by_role: string | null;
  requested_at: string;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

export async function listDeleteRequests(
  supabase: SupabaseClient,
  options?: { status?: DeleteRequestStatus }
): Promise<DeleteRequest[]> {
  let query = supabase
    .from("pos_delete_requests")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(200);
  if (options?.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) throw toCheckoutError(error);
  return (data ?? []) as DeleteRequest[];
}

export async function countPendingDeleteRequests(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("pos_delete_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}

/** Manager / staff: ask an admin to delete a bill. */
export async function requestPosOrderDelete(
  supabase: SupabaseClient,
  orderId: string,
  reason: string
) {
  const { error } = await supabase.rpc("request_pos_order_delete", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw toCheckoutError(error);
}

/** Admin: approve (deletes the bill, stock goes back) or reject. */
export async function reviewDeleteRequest(
  supabase: SupabaseClient,
  requestId: string,
  approve: boolean,
  note?: string
) {
  const { error } = await supabase.rpc("review_pos_delete_request", {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note?.trim() || null,
  });
  if (error) throw toCheckoutError(error);
}
