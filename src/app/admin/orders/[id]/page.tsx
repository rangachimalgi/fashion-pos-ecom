"use client";

import { useEffect, useState, type ReactNode } from "react";
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

function Detail({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  const empty = value == null || value === "";
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm break-all">{empty ? "—" : value}</p>
    </div>
  );
}

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

  const shipping = order.shipping;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold tracking-tight">#{shortOrderId(order.id)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{formatOrderTime(order.created_at)}</p>
        </div>
        <Link
          href="/admin/orders"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          All orders
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-border/80 bg-white px-4 py-4 shadow-sm">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Order</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Detail label="Order ID" value={order.id} />
          <Detail label="Placed" value={formatOrderTime(order.created_at)} />
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Channel
            </p>
            <div className="mt-1">
              <Badge variant="secondary">{sourceLabel(order.source)}</Badge>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Payment
            </p>
            <div className="mt-1">
              <Badge variant="outline">
                {paymentLabel(order.payment_method, order.source)}
              </Badge>
            </div>
          </div>
          <Detail label="Items" value={String(order.item_count)} />
          <Detail label="Total" value={formatInr(order.total_amount)} />
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-white px-4 py-4 shadow-sm">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {order.source === "POS" ? "Customer" : "Delivery"}
        </p>
        {order.source === "POS" && !shipping ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Counter sale — no name, phone, or address is stored.
          </p>
        ) : shipping ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Detail label="Name" value={shipping.customer_name} />
            <Detail
              label="Phone"
              value={
                shipping.customer_phone ? (
                  <a href={`tel:+91${shipping.customer_phone}`} className="hover:underline">
                    {shipping.customer_phone}
                  </a>
                ) : null
              }
            />
            <Detail label="Address line 1" value={shipping.address_line1} />
            <Detail label="Address line 2" value={shipping.address_line2} />
            <Detail label="City" value={shipping.city} />
            <Detail label="State" value={shipping.state} />
            <Detail label="Pincode" value={shipping.pincode} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No delivery details saved on this order. If this was a new online order, run
            supabase/migrations/008_order_delivery.sql.
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/80 bg-white shadow-sm">
        <div className="border-b border-border/80 px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Line items
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 pl-4 text-xs text-muted-foreground">Item</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Size</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Color</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Barcode</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Qty</TableHead>
              <TableHead className="h-11 text-xs text-muted-foreground">Unit</TableHead>
              <TableHead className="h-11 pr-4 text-right text-xs text-muted-foreground">
                Line total
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  No line items stored for this order.
                </TableCell>
              </TableRow>
            ) : (
              order.items.map((item, index) => (
                <TableRow key={`${item.variant_id}-${index}`}>
                  <TableCell className="py-3 pl-4">
                    <p className="text-sm font-medium">{item.product_name || "Deleted product"}</p>
                    {item.brand ? (
                      <p className="text-xs text-muted-foreground">{item.brand}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.size || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.color || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.barcode || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{item.quantity}</TableCell>
                  <TableCell className="text-sm">{formatInr(item.price_at_purchase)}</TableCell>
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
