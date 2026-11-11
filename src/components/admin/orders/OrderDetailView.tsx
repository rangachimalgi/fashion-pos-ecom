import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Phone, User } from "lucide-react";
import type { AdminOrder } from "@/types/order";
import { formatMoney, formatOrderTime, shortOrderId } from "@/lib/formatOrder";
import { ChannelBadge, PaymentTag } from "@/components/admin/orders/OrderBadges";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-white">
      <h3 className="border-b border-border bg-muted/40 px-5 py-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  );
}

export function OrderDetailView({ order }: { order: AdminOrder }) {
  const shipping = order.shipping;
  const addressLines = shipping
    ? [
        shipping.address_line1,
        shipping.address_line2,
        [shipping.city, shipping.state].filter(Boolean).join(", "),
        shipping.pincode,
      ].filter((line) => line && line.trim() !== "")
    : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 md:px-6">
      <div>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Orders
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="font-mono text-xl font-semibold tracking-tight">#{shortOrderId(order.id)}</h2>
          <ChannelBadge source={order.source} />
          <PaymentTag method={order.payment_method} source={order.source} />
          <span className="ml-auto text-sm text-muted-foreground">{formatOrderTime(order.created_at)}</span>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Items */}
        <section className="overflow-hidden rounded-xl border border-border bg-white">
          <h3 className="border-b border-border bg-muted/40 px-5 py-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Items · {order.item_count}
          </h3>
          {order.items.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">No line items stored for this order.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium">Item</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium">Price</th>
                    <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {order.items.map((item, index) => {
                    const variant = [item.size, item.color].filter(Boolean).join(" · ");
                    return (
                      <tr key={`${item.variant_id}-${index}`}>
                        <td className="px-5 py-3">
                          <p className="font-medium">{item.product_name || "Deleted product"}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[item.brand, variant].filter(Boolean).join(" · ") || "—"}
                          </p>
                          {item.barcode ? (
                            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">{item.barcode}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{item.quantity}</td>
                        <td className="px-3 py-3 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                          {formatMoney(item.price_at_purchase)}
                        </td>
                        <td className="px-5 py-3 text-right font-medium whitespace-nowrap tabular-nums">
                          {formatMoney(item.price_at_purchase * item.quantity)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border bg-muted/20 px-5 py-4">
            <span className="text-sm font-medium">Total</span>
            <span className="text-lg font-semibold tracking-tight tabular-nums">{formatMoney(order.total_amount)}</span>
          </div>
        </section>

        {/* Side */}
        <div className="flex flex-col gap-5">
          <Panel title="Summary">
            <dl className="divide-y divide-border">
              <Row label="Payment">
                <PaymentTag method={order.payment_method} source={order.source} className="font-medium" />
              </Row>
              {order.source === "POS" ? <Row label="Attended by">{order.attended_by || "—"}</Row> : null}
              <Row label="Order ID">
                <span className="font-mono text-xs font-normal text-muted-foreground">{order.id}</span>
              </Row>
            </dl>
          </Panel>

          <Panel title={order.source === "POS" ? "Customer" : "Delivery"}>
            {order.source === "POS" && !shipping ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                Counter sale. No name, phone or address is stored.
              </p>
            ) : shipping ? (
              <div className="flex flex-col gap-3 px-5 py-4 text-sm">
                <p className="flex items-center gap-2.5">
                  <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="font-medium">{shipping.customer_name || "—"}</span>
                </p>
                {shipping.customer_phone ? (
                  <p className="flex items-center gap-2.5">
                    <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <a href={`tel:+91${shipping.customer_phone}`} className="hover:underline">
                      +91 {shipping.customer_phone}
                    </a>
                  </p>
                ) : null}
                {addressLines.length > 0 ? (
                  <p className="flex items-start gap-2.5">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="leading-relaxed text-foreground/90">
                      {addressLines.map((line, index) => (
                        <span key={index} className="block">
                          {line}
                        </span>
                      ))}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                No delivery details saved on this order. If this was a new online order, run
                supabase/migrations/008_order_delivery.sql.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
