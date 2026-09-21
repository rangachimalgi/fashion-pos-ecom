import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { listAdminOrders } from "@/lib/adminOrders";

export async function GET() {
  try {
    const orders = await listAdminOrders(getSupabaseAdmin());
    return NextResponse.json({ orders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load orders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
