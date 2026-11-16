"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { listAdminOrders } from "@/lib/adminOrders";
import type { AdminOrder, OrderSource } from "@/types/order";
import { OrdersList, type OrdersListFocus } from "@/components/admin/orders/OrdersList";

type Loaded = { key: number; orders: AdminOrder[]; error: string | null };

function parseSource(value: string | null): OrderSource | "all" {
  if (value === "POS" || value === "ONLINE") return value;
  return "all";
}

function OrdersPageInner() {
  const searchParams = useSearchParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const focus = useMemo<OrdersListFocus>(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to") || from;
    const day = searchParams.get("day");
    return {
      from: day || from,
      to: day || to,
      source: parseSource(searchParams.get("source")),
      fromReport: searchParams.get("fromReport") === "1",
    };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    listAdminOrders(supabase)
      .then((orders) => {
        if (!cancelled) setLoaded({ key: reloadKey, orders, error: null });
      })
      .catch((err) => {
        console.error(err);
        if (cancelled) return;
        setLoaded({
          key: reloadKey,
          orders: [],
          error: err instanceof Error ? err.message : "Failed to load orders",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <OrdersList
      orders={loaded?.orders ?? []}
      loading={loaded?.key !== reloadKey}
      error={loaded?.error ?? null}
      onRefresh={() => setReloadKey((key) => key + 1)}
      focus={focus}
    />
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-6">
          <div className="h-9 w-72 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
        </div>
      }
    >
      <OrdersPageInner />
    </Suspense>
  );
}
