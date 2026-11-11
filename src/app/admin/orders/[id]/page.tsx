"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getAdminOrder } from "@/lib/adminOrders";
import type { AdminOrder } from "@/types/order";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { OrderDetailView } from "@/components/admin/orders/OrderDetailView";

export default function AdminOrderDetailPage() {
  const params = useParams();
  const orderId = params?.id as string;
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const next = await getAdminOrder(supabase, orderId);
        if (!next) throw new Error("Order not found");
        setOrder(next);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load order");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [orderId]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 md:px-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <p className="text-sm font-medium text-destructive">{error || "Order not found"}</p>
        <Link href="/admin/orders" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Back to orders
        </Link>
      </div>
    );
  }

  return <OrderDetailView order={order} />;
}
