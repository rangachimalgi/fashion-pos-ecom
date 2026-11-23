"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Heart, Minus, Plus, ShoppingBag, TicketPercent, Trash2, X } from "lucide-react";
import { AppHeader } from "@/components/store/AppHeader";
import { StoreFooter } from "@/components/store/StoreFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCartStore } from "@/store/useCartStore";
import { useWishlistStore } from "@/store/useWishlistStore";
import { getProductPrimaryImage } from "@/lib/productImages";
import { submitOnlineOrder } from "@/lib/checkoutClient";
import type { PaymentMethod, ShippingDetails } from "@/types/order";
import { emptyShipping, validateShipping } from "@/lib/shipping";
import { supabase } from "@/lib/supabaseClient";
import {
  checkCoupon,
  couponPricedLines,
  describeCoupon,
  normalizeCouponCode,
  type AppliedCoupon,
} from "@/lib/coupons";
import { validateEmail } from "@/lib/messaging";

export default function BagPage() {
  const {
    cart,
    incrementItem,
    decrementItem,
    removeItemFromCart,
    clearCart,
    getGrandTotal,
    getItemCount,
  } = useCartStore();
  const addToWishlist = useWishlistStore((state) => state.toggle);
  const alreadySaved = useWishlistStore((state) => state.has);

  const [mounted, setMounted] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("UPI");
  const [shipping, setShipping] = useState<ShippingDetails>(emptyShipping);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ orderId: string; total: number; saved: number } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [offersOptIn, setOffersOptIn] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("vibewear-shipping");
      if (saved) setShipping({ ...emptyShipping(), ...JSON.parse(saved) });
    } catch {
      // Ignore bad local shipping cache.
    }
  }, []);

  const total = mounted ? getGrandTotal() : 0;
  const itemCount = mounted ? getItemCount() : 0;
  const styles = mounted ? cart.length : 0;
  const priced =
    mounted && coupon
      ? couponPricedLines(
          cart.map((item) => ({ mrp: Number(item.product.base_price), quantity: item.quantity })),
          coupon
        )
      : null;
  const couponShort = coupon && total < coupon.min_order ? coupon.min_order - total : 0;
  const payable = priced ? priced.total : total;

  const applyCoupon = async () => {
    const code = normalizeCouponCode(couponInput);
    if (!code || checkingCoupon) return;
    setCheckingCoupon(true);
    setCouponError(null);
    try {
      const next = await checkCoupon(supabase, {
        code,
        source: "ONLINE",
        subtotal: total,
        phone: shipping.customer_phone,
      });
      setCoupon(next);
      setCouponInput(next.code);
    } catch (err) {
      setCoupon(null);
      setCouponError(err instanceof Error ? err.message : "Could not apply that coupon");
    } finally {
      setCheckingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponError(null);
  };

  const updateShipping = <K extends keyof ShippingDetails>(key: K, value: ShippingDetails[K]) => {
    setShipping((current) => {
      const next = { ...current, [key]: value };
      localStorage.setItem("vibewear-shipping", JSON.stringify(next));
      return next;
    });
  };

  const moveToWishlist = (variantId: string) => {
    const line = cart.find((item) => item.variant.id === variantId);
    if (!line) return;
    if (!alreadySaved(line.product.id)) addToWishlist(line.product);
    removeItemFromCart(variantId);
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || submitting) return;

    const shippingError = validateShipping(shipping);
    if (shippingError) {
      setError(shippingError);
      return;
    }
    if (coupon && couponShort > 0) {
      setError(`Add ₹${couponShort} more to use ${coupon.code}, or remove the coupon.`);
      return;
    }
    const emailError = validateEmail(contactEmail);
    if (emailError) {
      setError(emailError);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = await submitOnlineOrder({
        payment_method: paymentMethod,
        items: cart.map((item) => ({
          variant_id: item.variant.id,
          quantity: item.quantity,
        })),
        shipping,
        coupon_code: coupon?.code ?? null,
        customer_profile: { email: contactEmail.trim(), opt_in: offersOptIn },
      });

      clearCart();
      setCoupon(null);
      setCouponInput("");
      setReceipt({
        orderId: payload.order_id,
        total: payload.total_amount,
        saved: payload.coupon_discount ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {!mounted ? (
          <div className="h-40 animate-pulse rounded-xl bg-white" />
        ) : receipt ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-slate-100 bg-white px-6 py-16 text-center">
            <ShoppingBag className="size-8 text-rose-500" />
            <p className="text-sm font-black tracking-wider uppercase">Order confirmed</p>
            <p className="text-xs text-slate-500">We’ll deliver to the address you entered.</p>
            <p className="font-mono text-xs break-all text-slate-500">#{receipt.orderId}</p>
            <p className="text-2xl font-black">₹{receipt.total}</p>
            {receipt.saved > 0 ? (
              <p className="text-xs font-bold text-emerald-600">You saved ₹{receipt.saved} with your coupon</p>
            ) : null}
            <Link
              href="/"
              className="mt-2 inline-flex h-10 items-center rounded-lg bg-rose-500 px-4 text-sm font-bold text-white hover:bg-rose-600"
            >
              Continue shopping
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-6 text-center text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase">
              My bag
            </p>

            {styles === 0 ? (
              <div className="mx-auto max-w-md space-y-3 rounded-xl border border-dashed border-slate-200 bg-white py-20 text-center">
                <ShoppingBag className="mx-auto size-8 stroke-[1.25] text-slate-300" />
                <p className="text-sm font-bold text-slate-500">Your bag is empty</p>
                <p className="text-xs text-slate-400">Add a color and size from a product to start a bag.</p>
                <div className="flex justify-center gap-3 pt-2">
                  <Link href="/" className="text-sm font-bold text-brand hover:underline">
                    Browse the shop
                  </Link>
                  <Link href="/wishlist" className="text-sm font-bold text-slate-600 hover:underline">
                    Add from wishlist
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-100 bg-white">
                    <div className="border-b border-slate-100 px-4 py-3 text-xs font-bold text-slate-700">
                      {itemCount} item{itemCount === 1 ? "" : "s"} selected{" "}
                      <span className="font-semibold text-slate-400">(₹{total})</span>
                    </div>
                    <ul>
                      {cart.map((item) => (
                        <li
                          key={item.variant.id}
                          className="flex gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0"
                        >
                          <Link
                            href={`/product/${item.product.id}`}
                            className="size-24 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 sm:size-28"
                          >
                            {getProductPrimaryImage(item.product) ? (
                              <img
                                src={getProductPrimaryImage(item.product)!}
                                alt={item.product.name}
                                className="size-full object-cover"
                              />
                            ) : null}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <Link
                                  href={`/product/${item.product.id}`}
                                  className="truncate text-sm font-bold hover:underline"
                                >
                                  {item.product.name}
                                </Link>
                                <p className="truncate text-xs text-slate-500">{item.product.brand}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Size: {item.variant.size} · {item.variant.color}
                                </p>
                              </div>
                              <p className="shrink-0 text-sm font-black">
                                ₹{item.product.base_price * item.quantity}
                              </p>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="icon-xs"
                                  onClick={() => decrementItem(item.variant.id)}
                                >
                                  <Minus />
                                </Button>
                                <span className="w-7 text-center text-xs font-bold">{item.quantity}</span>
                                <Button
                                  variant="outline"
                                  size="icon-xs"
                                  disabled={item.quantity >= item.variant.stock_quantity}
                                  onClick={() => incrementItem(item.variant.id)}
                                >
                                  <Plus />
                                </Button>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-[11px] font-bold tracking-wide text-slate-500 uppercase"
                                  onClick={() => moveToWishlist(item.variant.id)}
                                >
                                  Move to wishlist
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  className="text-rose-500"
                                  onClick={() => removeItemFromCart(item.variant.id)}
                                  aria-label="Remove"
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    href="/wishlist"
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <Heart className="size-4 stroke-[1.75]" />
                      Add from wishlist
                    </span>
                    <ChevronRight className="size-4 text-slate-400" />
                  </Link>

                  <div className="space-y-3 rounded-xl border border-slate-100 bg-white px-4 py-4">
                    <p className="text-xs font-black tracking-wider text-slate-400 uppercase">
                      Delivery
                    </p>
                    <Input
                      required
                      placeholder="Full name"
                      value={shipping.customer_name}
                      onChange={(event) => updateShipping("customer_name", event.target.value)}
                    />
                    <Input
                      required
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="10-digit mobile"
                      value={shipping.customer_phone}
                      onChange={(event) =>
                        updateShipping("customer_phone", event.target.value.replace(/\D/g, "").slice(0, 10))
                      }
                    />
                    <Input
                      required
                      placeholder="House no., street, area"
                      value={shipping.address_line1}
                      onChange={(event) => updateShipping("address_line1", event.target.value)}
                    />
                    <Input
                      placeholder="Apartment, landmark (optional)"
                      value={shipping.address_line2}
                      onChange={(event) => updateShipping("address_line2", event.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        required
                        placeholder="City"
                        value={shipping.city}
                        onChange={(event) => updateShipping("city", event.target.value)}
                      />
                      <Input
                        required
                        placeholder="State"
                        value={shipping.state}
                        onChange={(event) => updateShipping("state", event.target.value)}
                      />
                    </div>
                    <Input
                      required
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Pincode"
                      value={shipping.pincode}
                      onChange={(event) =>
                        updateShipping("pincode", event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                    />
                    <Input
                      type="email"
                      placeholder="Email (optional)"
                      autoComplete="email"
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                    />
                    <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
                      <input
                        type="checkbox"
                        checked={offersOptIn}
                        onChange={(event) => setOffersOptIn(event.target.checked)}
                        className="mt-0.5"
                      />
                      Send me offers and birthday wishes on WhatsApp / email
                    </label>
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      We’ll use this number to confirm the order. No login or OTP.
                    </p>
                  </div>
                </div>

                <aside className="rounded-xl border border-slate-100 bg-white p-4 lg:sticky lg:top-28">
                  <p className="mb-4 text-[11px] font-black tracking-wider text-slate-400 uppercase">
                    Billing details
                  </p>
                  <div className="mb-4">
                    {coupon ? (
                      <div className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-3 py-2">
                        <TicketPercent className="size-4 shrink-0 text-emerald-600" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black tracking-wider text-emerald-700">{coupon.code}</p>
                          <p className="truncate text-[11px] text-emerald-700/80">
                            {coupon.description || describeCoupon(coupon)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={removeCoupon}
                          className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
                          aria-label="Remove coupon"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void applyCoupon();
                        }}
                      >
                        <Input
                          placeholder="Coupon code"
                          value={couponInput}
                          onChange={(event) => {
                            setCouponInput(normalizeCouponCode(event.target.value));
                            setCouponError(null);
                          }}
                          className="h-9 uppercase"
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          disabled={!couponInput || checkingCoupon}
                          className="h-9 shrink-0 text-xs font-black tracking-wider uppercase"
                        >
                          {checkingCoupon ? "…" : "Apply"}
                        </Button>
                      </form>
                    )}
                    {couponError ? (
                      <p className="mt-1.5 text-[11px] font-medium text-rose-500">{couponError}</p>
                    ) : couponShort > 0 ? (
                      <p className="mt-1.5 text-[11px] font-medium text-amber-600">
                        Add ₹{couponShort} more to use this coupon.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Cart total</span>
                      <span className="font-semibold">₹{total}</span>
                    </div>
                    {priced && priced.discount > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Coupon ({coupon?.code})</span>
                        <span className="font-semibold text-emerald-600">− ₹{priced.discount}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-base font-black">
                      <span>Total amount</span>
                      <span>₹{payable}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: "UPI" as const, label: "UPI" },
                        { id: "CASH" as const, label: "Cash on delivery" },
                      ] satisfies { id: PaymentMethod; label: string }[]
                    ).map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setPaymentMethod(method.id)}
                        className={`rounded-lg border px-2 py-2 text-[11px] font-black tracking-wider ${
                          paymentMethod === method.id
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        {method.label}
                      </button>
                    ))}
                  </div>

                  {error ? (
                    <p className="mt-3 text-xs font-medium text-rose-500">{error}</p>
                  ) : null}

                  <Button
                    disabled={submitting}
                    onClick={handleCheckout}
                    className="mt-4 h-12 w-full bg-rose-500 text-sm font-black tracking-wider text-white uppercase hover:bg-rose-600"
                  >
                    {submitting ? "Placing order..." : "Place order"}
                  </Button>
                </aside>
              </div>
            )}
          </>
        )}
      </div>
      <StoreFooter />
    </div>
  );
}
