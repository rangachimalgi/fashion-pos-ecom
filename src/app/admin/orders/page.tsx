"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { listAdminOrders } from "@/lib/adminOrders";
import type { AdminOrder } from "@/types/order";
import { OrdersList } from "@/components/admin/orders/OrdersList";

type Loaded = { key: number; orders: AdminOrder[]; error: string | null };

export default function AdminOrdersPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

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
    />
  );
}
