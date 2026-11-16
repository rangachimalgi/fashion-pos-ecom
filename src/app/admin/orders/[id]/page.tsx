"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getAdminOrder } from "@/lib/adminOrders";
import type { AdminOrder } from "@/types/order";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { OrderDetailView } from "@/components/admin/orders/OrderDetailView";

function safeBackHref(raw: string | null): string {
  if (!raw) return "/admin/orders";
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("/admin/orders")) return decoded;
  } catch {
    /* ignore bad encoding */
  }
  return "/admin/orders";
}

function OrderDetailInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = params?.id as string;
  const backHref = useMemo(
    () => safeBackHref(searchParams.get("back")),
    [searchParams]
  );
  const backLabel = backHref.includes("fromReport=1")
    ? "Back to bills"
    : backHref.includes("from=") || backHref.includes("day=")
      ? "Back to bills"
      : "Orders";

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
        <Link href={backHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          {backLabel}
        </Link>
      </div>
    );
  }

  return <OrderDetailView order={order} backHref={backHref} backLabel={backLabel} />;
}

export default function AdminOrderDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 md:px-6">
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
        </div>
      }
    >
      <OrderDetailInner />
    </Suspense>
  );
}
