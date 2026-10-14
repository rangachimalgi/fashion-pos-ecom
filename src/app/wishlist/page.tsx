"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { AppHeader } from "@/components/store/AppHeader";
import { StoreFooter } from "@/components/store/StoreFooter";
import { WishlistItem } from "@/components/store/WishlistItem";
import { ProductCard } from "@/components/store/ProductCard";
import { useWishlistStore } from "@/store/useWishlistStore";
import { supabase } from "@/lib/supabaseClient";
import type { CompleteProduct, Product, ProductVariant } from "@/types/product";

export default function WishlistPage() {
  const items = useWishlistStore((state) => state.items);
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState<Record<string, CompleteProduct>>({});
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const list = ready ? items : [];
  const idsKey = useMemo(() => list.map((item) => item.id).join(","), [list]);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (!ready || ids.length === 0) {
      setCatalogLoaded(true);
      return;
    }

    let cancelled = false;
    setCatalogLoaded(false);

    async function loadVariants() {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*)")
        .in("id", ids);

      if (cancelled) return;

      const next: Record<string, CompleteProduct> = {};
      if (!error) {
        for (const row of data ?? []) {
          const record = row as Record<string, unknown>;
          next[String(record.id)] = {
            ...(record as unknown as Product),
            variants: (record.product_variants as ProductVariant[]) || [],
          } as CompleteProduct;
        }
      }
      setCatalog(next);
      setCatalogLoaded(true);
    }

    loadVariants();
    return () => {
      cancelled = true;
    };
  }, [ready, idsKey]);

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-lg font-black tracking-tight sm:text-xl">Wishlist</h1>
        <p className="mt-1 text-sm text-slate-500">
          {ready ? `${list.length} saved style${list.length === 1 ? "" : "s"}` : "…"}
        </p>

        {!ready ? (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="animate-pulse space-y-3">
                <div className="aspect-3/4 w-full rounded-xl bg-slate-100" />
                <div className="h-3 w-1/3 rounded bg-slate-100" />
                <div className="h-4 w-3/4 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="mx-auto mt-16 max-w-md space-y-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-20 text-center">
            <Heart className="mx-auto size-8 stroke-[1.25] text-slate-300" />
            <p className="text-sm font-bold text-slate-500">Nothing saved yet</p>
            <p className="mx-auto max-w-xs text-xs text-slate-400">
              Tap the heart on a product to keep it here on this device.
            </p>
            <Link href="/" className="inline-block text-sm font-bold text-brand hover:underline">
              Browse the shop
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {list.map((saved) => {
              const live = catalog[saved.id];
              if (live) return <WishlistItem key={saved.id} product={live} />;
              return (
                <div key={saved.id} className="space-y-3">
                  <ProductCard product={saved} />
                  <button
                    type="button"
                    disabled
                    className="flex h-10 w-full items-center justify-center rounded-xl bg-slate-100 text-[11px] font-extrabold tracking-wider text-slate-400 uppercase"
                  >
                    {catalogLoaded ? "Unavailable" : "Add to bag"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <StoreFooter />
    </div>
  );
}
