"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cleanSearchQuery, searchPosProducts, type PosSearchResult } from "@/lib/posSearch";
import { reservedQtyOnOrder } from "@/lib/posOrderMutations";
import { formatInr } from "@/lib/formatOrder";
import type { AdminOrder } from "@/types/order";
import type { CompleteProduct, ProductVariant } from "@/types/product";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

/**
 * Dropdown of matching products under the POS scan box. Pick a size to add it
 * to the bill. A barcode scanner never sees this: it finishes and presses Enter
 * well inside the debounce, which clears the box.
 */
export function PosSearchSuggestions({
  query,
  open,
  editingOrder,
  onPick,
}: {
  query: string;
  open: boolean;
  editingOrder: AdminOrder | null;
  onPick: (product: CompleteProduct, variant: ProductVariant) => void;
}) {
  const clean = cleanSearchQuery(query);
  const [state, setState] = useState<{
    q: string;
    results: PosSearchResult[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (clean.length < MIN_CHARS) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      searchPosProducts(supabase, clean)
        .then((results) => {
          if (!cancelled) setState({ q: clean, results, error: null });
        })
        .catch((err) => {
          if (!cancelled) {
            setState({
              q: clean,
              results: [],
              error: err instanceof Error ? err.message : "Search failed",
            });
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clean]);

  if (!open || clean.length < MIN_CHARS) return null;

  const fresh = state?.q === clean;

  return (
    <div
      // Keep focus in the input so a click on a size does not blur (and close) the list.
      onMouseDown={(event) => event.preventDefault()}
      className="absolute top-full right-0 left-0 z-30 mt-1 max-h-96 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 shadow-2xl"
    >
      {!state || !fresh ? (
        <p className="px-3 py-3 font-sans text-xs text-slate-400">Searching…</p>
      ) : state.error ? (
        <p className="px-3 py-3 font-sans text-xs text-rose-400">{state.error}</p>
      ) : state.results.length === 0 ? (
        <p className="px-3 py-3 font-sans text-xs text-slate-400">
          Nothing matches “{clean}”. Try a shorter name, brand or style code.
        </p>
      ) : (
        state.results.map(({ product, matchedVariantId }) => (
          <div key={product.id} className="border-b border-slate-700 px-3 py-2 last:border-b-0">
            <div className="flex items-baseline gap-2 font-sans">
              <span className="truncate text-sm font-semibold text-white">{product.name}</span>
              <span className="truncate text-xs text-slate-400">
                {[product.brand, product.style_code].filter(Boolean).join(" · ")}
              </span>
              <span className="ml-auto shrink-0 text-xs font-semibold text-emerald-300">
                {formatInr(product.base_price)}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {product.variants.length === 0 ? (
                <span className="font-sans text-xs text-slate-500">No sizes</span>
              ) : (
                product.variants.map((variant) => {
                  const available =
                    Number(variant.stock_quantity ?? 0) + reservedQtyOnOrder(editingOrder, variant.id);
                  const out = available <= 0;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={out}
                      onClick={() => onPick(product, variant)}
                      className={`rounded-md border px-2 py-1 font-sans text-[11px] font-semibold ${
                        out
                          ? "cursor-not-allowed border-slate-700 text-slate-600"
                          : matchedVariantId === variant.id
                            ? "border-emerald-400 bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/40"
                            : "border-slate-500 text-slate-200 hover:border-emerald-400 hover:bg-slate-700"
                      }`}
                    >
                      {variant.size}
                      {variant.color ? ` · ${variant.color}` : ""}{" "}
                      <span className={out ? "" : "text-slate-400"}>
                        {out ? "out" : `${available} left`}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
