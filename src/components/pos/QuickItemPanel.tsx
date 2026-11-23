"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { QUICK_ITEM_NAMES, quickAddItem, validateQuickItem } from "@/lib/posQuickItem";
import type { CompleteProduct, ProductVariant } from "@/types/product";

export type QuickItemPrefill = { name?: string; price?: number; size?: string };

export function QuickItemPanel({
  prefill,
  onAdded,
  onClose,
}: {
  prefill: QuickItemPrefill;
  onAdded: (product: CompleteProduct, variant: ProductVariant) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(prefill.name ?? "");
  const [price, setPrice] = useState(prefill.price ? String(prefill.price) : "");
  const [quantity, setQuantity] = useState("1");
  const [size, setSize] = useState(prefill.size ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input = { name, price: Number(price), quantity: Number(quantity), size };
    const problem = validateQuickItem(input);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { product, variant } = await quickAddItem(supabase, input);
      onAdded(product, variant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the item");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "h-9 rounded-md border border-slate-600 bg-slate-950 px-2.5 font-sans text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/60";

  return (
    <form
      onSubmit={submit}
      className="mb-4 rounded-lg border border-emerald-500/30 bg-slate-900/70 p-3 font-sans"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-emerald-300">Quick item — not in the catalog</p>
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-white">
          Cancel
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        {QUICK_ITEM_NAMES.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setName(label)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
              name === label
                ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                : "border-slate-600 text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="What is it? e.g. T-shirt"
          className={`${field} min-w-40 flex-1`}
        />
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">₹</span>
          <input
            type="number"
            min={1}
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="Price"
            className={`${field} w-28 pl-6 tabular-nums`}
          />
        </div>
        <input
          value={size}
          onChange={(event) => setSize(event.target.value)}
          placeholder="Size"
          className={`${field} w-20`}
        />
        <input
          type="number"
          min={1}
          max={999}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          title="Quantity"
          className={`${field} w-16 text-center tabular-nums`}
        />
        <button
          type="submit"
          disabled={saving}
          className="h-9 rounded-md bg-emerald-600 px-4 text-xs font-black tracking-wider text-white hover:bg-emerald-500 disabled:bg-slate-700"
        >
          {saving ? "…" : "ADD TO BILL"}
        </button>
      </div>

      {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
      <p className="mt-2 text-[10px] text-slate-500">
        Price is what the customer pays. It&apos;s saved as a store-only item — admin can finish it later in Products.
      </p>
    </form>
  );
}
