"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/useCartStore";
import type { PaymentMethod } from "@/types/order";

export function CartDrawer() {
  const pathname = usePathname();
  const {
    cart,
    isBagOpen,
    closeBag,
    incrementItem,
    decrementItem,
    removeItemFromCart,
    clearCart,
    getGrandTotal,
  } = useCartStore();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("UPI");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ orderId: string; total: number } | null>(null);

  const total = getGrandTotal();

  if (pathname.startsWith("/billing")) {
    return null;
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeBag();
      setError(null);
      setReceipt(null);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_method: paymentMethod,
          source: "ONLINE",
          items: cart.map((item) => ({
            variant_id: item.variant.id,
            quantity: item.quantity,
          })),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Checkout failed");
      }

      clearCart();
      setReceipt({ orderId: payload.order_id, total: payload.total_amount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isBagOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-0 right-0 left-auto h-dvh max-h-dvh w-full max-w-md translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 p-0 sm:max-w-md data-open:slide-in-from-right data-closed:slide-out-to-right data-open:zoom-in-100 data-closed:zoom-out-100"
      >
        <div className="flex h-full flex-col bg-white text-slate-900">
          <DialogHeader className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <DialogTitle className="font-black tracking-widest uppercase text-slate-900">
                  Shopping Bag
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  {receipt ? "Order placed" : `${cart.length} style${cart.length === 1 ? "" : "s"} in your bag`}
                </DialogDescription>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => handleOpenChange(false)}>
                <X className="size-4" />
                <span className="sr-only">Close bag</span>
              </Button>
            </div>
          </DialogHeader>

          {receipt ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <ShoppingBag className="size-8 text-rose-500" />
              <p className="text-sm font-black uppercase tracking-wider">Order confirmed</p>
              <p className="text-xs text-slate-500 font-mono break-all">#{receipt.orderId}</p>
              <p className="text-2xl font-black">₹{receipt.total}</p>
              <Button className="mt-2 bg-rose-500 text-white hover:bg-rose-600" onClick={() => handleOpenChange(false)}>
                Continue shopping
              </Button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {cart.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-400">
                    <ShoppingBag className="size-8 stroke-[1.25]" />
                    <p className="text-sm font-bold">Your bag is empty</p>
                    <p className="text-xs">Add a size from the catalog to start a bag.</p>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {cart.map((item) => (
                      <li key={item.variant.id} className="flex gap-3 border-b border-slate-100 pb-4">
                        <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-slate-50 border border-slate-100">
                          {item.product.image_url ? (
                            <img
                              src={item.product.image_url}
                              alt={item.product.name}
                              className="size-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="truncate text-sm font-extrabold">{item.product.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {item.variant.size} · {item.variant.color}
                          </p>
                          <p className="text-sm font-black">₹{item.product.base_price * item.quantity}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="icon-xs"
                                onClick={() => decrementItem(item.variant.id)}
                              >
                                <Minus />
                              </Button>
                              <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                              <Button
                                variant="outline"
                                size="icon-xs"
                                disabled={item.quantity >= item.variant.stock_quantity}
                                onClick={() => incrementItem(item.variant.id)}
                              >
                                <Plus />
                              </Button>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="text-rose-500"
                              onClick={() => removeItemFromCart(item.variant.id)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-slate-100 px-5 py-4 space-y-3">
                {error ? (
                  <p className="text-xs font-medium text-rose-500">{error}</p>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  {(["UPI", "CASH"] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`rounded-lg border py-2 text-xs font-black tracking-wider ${
                        paymentMethod === method
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total</span>
                  <span className="text-2xl font-black">₹{total}</span>
                </div>

                <Button
                  disabled={cart.length === 0 || submitting}
                  onClick={handleCheckout}
                  className="h-12 w-full bg-rose-500 text-white hover:bg-rose-600"
                >
                  {submitting ? "Placing order..." : "Place order"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BagButton() {
  const { openBag, getItemCount } = useCartStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const count = ready ? getItemCount() : 0;

  return (
    <button
      type="button"
      onClick={openBag}
      className="flex flex-col items-center cursor-pointer hover:text-rose-500 transition relative"
    >
      <ShoppingBag className="w-5 h-5 stroke-[1.5]" />
      <span className="text-[10px] font-bold mt-1 uppercase tracking-tight">Bag</span>
      {count > 0 && (
        <span className="absolute -top-1.5 -right-2 bg-rose-500 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center scale-95 px-1">
          {count}
        </span>
      )}
    </button>
  );
}
