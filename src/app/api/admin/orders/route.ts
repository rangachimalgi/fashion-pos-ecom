import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listAdminOrders } from "@/lib/adminOrders";
import { AuthError, requireStaff } from "@/lib/serverAuth";

export async function GET(request: Request) {
  try {
    await requireStaff(request, ["admin"]);
    const orders = await listAdminOrders(getSupabaseAdmin());
    return NextResponse.json({ orders });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/orders] failed", err);
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
}
