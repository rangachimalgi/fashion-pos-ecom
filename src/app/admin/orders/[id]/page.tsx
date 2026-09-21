"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getAdminOrder } from "@/lib/adminOrders";
import type { AdminOrder } from "@/types/order";
import {
  formatInr,
  formatOrderTime,
  paymentLabel,
  shortOrderId,
  sourceLabel,
} from "@/lib/formatOrder";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Loading order…
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">#{shortOrderId(order.id)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{formatOrderTime(order.created_at)}</p>
        </div>
        <Link
          href="/admin/orders"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          All orders
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{sourceLabel(order.source)}</Badge>
        <Badge variant="outline">{paymentLabel(order.payment_method)}</Badge>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border/80 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 pl-4 text-xs text-muted-foreground">Item</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Size</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Color</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Qty</TableHead>
              <TableHead className="h-11 pr-4 text-right text-xs text-muted-foreground">
                Line total
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                  No line items stored for this order.
                </TableCell>
              </TableRow>
            ) : (
              order.items.map((item, index) => (
                <TableRow key={`${item.variant_id}-${index}`}>
                  <TableCell className="py-3 pl-4 text-sm font-medium">
                    {item.product_name || "Deleted product"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.size || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.color || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{item.quantity}</TableCell>
                  <TableCell className="pr-4 text-right text-sm font-medium">
                    {formatInr(item.price_at_purchase * item.quantity)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-border/80 px-4 py-3">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-sm font-semibold">{formatInr(order.total_amount)}</span>
        </div>
      </div>
    </div>
  );
}
