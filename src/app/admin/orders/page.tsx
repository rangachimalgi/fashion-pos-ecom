"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ListFilter } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { listAdminOrders } from "@/lib/adminOrders";
import type { AdminOrder, OrderSource, PaymentMethod } from "@/types/order";
import {
  formatInr,
  formatOrderTime,
  paymentLabel,
  shortOrderId,
  sourceLabel,
} from "@/lib/formatOrder";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<OrderSource | "all">("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentMethod | "all">("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listAdminOrders(supabase);
      setOrders(next);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      if (sourceFilter !== "all" && order.source !== sourceFilter) return false;
      if (paymentFilter !== "all" && order.payment_method !== paymentFilter) return false;
      return true;
    });
  }, [orders, sourceFilter, paymentFilter]);

  const activeFilterCount =
    (sourceFilter === "all" ? 0 : 1) + (paymentFilter === "all" ? 0 : 1);

  return (
    <div className="space-y-4 px-4 py-6 md:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-medium">
          {loading ? "…" : filtered.length} orders
        </h2>

        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 bg-white"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((open) => !open)}
          >
            <ListFilter className="size-3.5" />
            Filter
            {activeFilterCount > 0 ? (
              <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>

          {filterOpen ? (
            <div className="absolute top-[calc(100%+0.5rem)] right-0 z-20 w-56 rounded-xl border border-border bg-white p-3 shadow-md">
              <p className="mb-2 text-sm font-medium">Filter orders</p>
              <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Source
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "POS", "ONLINE"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSourceFilter(value)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                      sourceFilter === value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-white text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {value === "all" ? "All" : sourceLabel(value)}
                  </button>
                ))}
              </div>
              <p className="mt-3 mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Payment
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "CASH", "UPI"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPaymentFilter(value)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                      paymentFilter === value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-white text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {value === "all" ? "All" : paymentLabel(value)}
                  </button>
                ))}
              </div>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  className="mt-3 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSourceFilter("all");
                    setPaymentFilter("all");
                    setFilterOpen(false);
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border/80 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-border/70 hover:bg-transparent">
              <TableHead className="h-11 pl-4 text-xs text-muted-foreground">Order</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Placed</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Source</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Payment</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Items</TableHead>
              <TableHead className="h-11 pr-4 text-right text-xs text-muted-foreground">
                Total
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  <TableCell className="pl-4" colSpan={6}>
                    <div className="h-3 w-40 animate-pulse rounded bg-muted py-2" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-20 text-center">
                  <p className="text-sm font-medium">No orders yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Close an invoice on POS or complete a bag checkout, then refresh.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((order) => (
                <TableRow key={order.id} className="border-border/60">
                  <TableCell className="py-3 pl-4">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      #{shortOrderId(order.id)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatOrderTime(order.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{sourceLabel(order.source)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {paymentLabel(order.payment_method)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {order.item_count}
                  </TableCell>
                  <TableCell className="pr-4 text-right text-sm font-medium">
                    {formatInr(order.total_amount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
