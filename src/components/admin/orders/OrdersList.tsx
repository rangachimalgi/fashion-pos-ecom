"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import type { AdminOrder, OrderSource, PaymentMethod } from "@/types/order";
import { formatMoney, shortOrderId } from "@/lib/formatOrder";
import { SHOP_TIMEZONE, addDays, todayInShop } from "@/lib/salesReport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/admin/Segmented";
import { ChannelBadge, PaymentTag } from "@/components/admin/orders/OrderBadges";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

type When = "all" | "today" | "7d" | "30d";

/** The shop-calendar day (YYYY-MM-DD) of a timestamp. */
function shopDay(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dayLabel(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: SHOP_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: SHOP_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .toUpperCase();
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function OrdersList({
  orders,
  loading,
  error,
  onRefresh,
}: {
  orders: AdminOrder[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<OrderSource | "all">("all");
  const [payment, setPayment] = useState<PaymentMethod | "all">("all");
  const [when, setWhen] = useState<When>("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const today = todayInShop();
    const since = when === "today" ? today : when === "7d" ? addDays(today, -6) : when === "30d" ? addDays(today, -29) : null;

    return orders.filter((order) => {
      if (source !== "all" && order.source !== source) return false;
      if (payment !== "all" && order.payment_method !== payment) return false;
      if (since && shopDay(order.created_at) < since) return false;
      if (!needle) return true;
      const haystack = [
        shortOrderId(order.id),
        order.id,
        order.shipping?.customer_name,
        order.shipping?.customer_phone,
        order.attended_by,
        ...order.items.flatMap((item) => [item.product_name, item.barcode]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [orders, query, source, payment, when]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((sum, order) => sum + order.total_amount, 0);
    const items = filtered.reduce((sum, order) => sum + order.item_count, 0);
    return {
      revenue,
      items,
      average: filtered.length ? revenue / filtered.length : 0,
    };
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const filtering = query.trim() !== "" || source !== "all" || payment !== "all" || when !== "all";

  const reset = () => {
    setQuery("");
    setSource("all");
    setPayment("all");
    setWhen("all");
    setPage(0);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Search order, customer, item…"
            aria-label="Search orders"
            className="h-9 bg-white pl-8"
          />
        </div>
        <Segmented
          label="Date"
          value={when}
          onChange={(next) => {
            setWhen(next);
            setPage(0);
          }}
          options={[
            { value: "all", label: "All time" },
            { value: "today", label: "Today" },
            { value: "7d", label: "7 days" },
            { value: "30d", label: "30 days" },
          ]}
        />
        <Segmented
          label="Channel"
          value={source}
          onChange={(next) => {
            setSource(next);
            setPage(0);
          }}
          options={[
            { value: "all", label: "All channels" },
            { value: "POS", label: "POS" },
            { value: "ONLINE", label: "Online" },
          ]}
        />
        <Segmented
          label="Payment"
          value={payment}
          onChange={(next) => {
            setPayment(next);
            setPage(0);
          }}
          options={[
            { value: "all", label: "Any payment" },
            { value: "CASH", label: "Cash" },
            { value: "UPI", label: "UPI" },
          ]}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="ml-auto size-9 bg-white"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh orders"
          title="Refresh"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </div>
      ) : null}

      {/* Summary of what is currently listed */}
      <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-white sm:grid-cols-4 sm:divide-y-0">
        <Stat label="Orders" value={loading ? "…" : filtered.length.toLocaleString("en-IN")} />
        <Stat label="Revenue" value={loading ? "…" : formatMoney(Math.round(totals.revenue * 100) / 100)} />
        <Stat label="Average order" value={loading ? "…" : formatMoney(Math.round(totals.average * 100) / 100)} />
        <Stat label="Items sold" value={loading ? "…" : totals.items.toLocaleString("en-IN")} />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Channel</th>
                <th className="px-3 py-3 font-medium">Payment</th>
                <th className="px-3 py-3 text-right font-medium">Items</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="w-10 py-3 pr-4" aria-hidden />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={7} className="px-5 py-4">
                      <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <p className="font-medium">{filtering ? "No orders match" : "No orders yet"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {filtering
                        ? "Try a different search or clear the filters."
                        : "Close an invoice on POS or complete a bag checkout, then refresh."}
                    </p>
                    {filtering ? (
                      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={reset}>
                        Clear filters
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ) : (
                visible.map((order) => (
                  <tr
                    key={order.id}
                    tabIndex={0}
                    onClick={() => router.push(`/admin/orders/${order.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") router.push(`/admin/orders/${order.id}`);
                    }}
                    className="group cursor-pointer outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="font-mono text-[13px] font-medium tracking-tight hover:underline"
                      >
                        #{shortOrderId(order.id)}
                      </Link>
                      <p className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground">
                        {order.shipping?.customer_name || (order.source === "POS" ? "Counter sale" : "—")}
                      </p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p>{dayLabel(order.created_at)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{timeLabel(order.created_at)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <ChannelBadge source={order.source} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <PaymentTag method={order.payment_method} source={order.source} />
                    </td>
                    <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{order.item_count}</td>
                    <td className="px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
                      {formatMoney(order.total_amount)}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <ChevronRight className="inline size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-3 text-sm">
            <p className="text-muted-foreground tabular-nums">
              {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length.toLocaleString("en-IN")}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="bg-white"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-16 text-center text-xs text-muted-foreground tabular-nums">
                Page {current + 1} / {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="bg-white"
                disabled={current >= pageCount - 1}
                onClick={() => setPage(current + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
