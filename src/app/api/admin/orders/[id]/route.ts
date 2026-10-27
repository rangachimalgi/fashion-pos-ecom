import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminOrder } from "@/lib/adminOrders";
import { AuthError, requireStaff } from "@/lib/serverAuth";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaff(request, ["admin"]);
    const { id } = await context.params;
    const order = await getAdminOrder(getSupabaseAdmin(), id);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/orders/:id] failed", err);
    return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  }
}
