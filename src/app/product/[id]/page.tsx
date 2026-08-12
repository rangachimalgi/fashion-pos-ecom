"use client";
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { CompleteProduct, ProductVariant } from '@/types/product';
import { useCartStore } from '@/store/useCartStore';
import { ShoppingBag, ChevronLeft, Star, ShieldCheck, Truck, RefreshCw } from 'lucide-react';

export default function ProductDetailsView() {
  const params = useParams();
  const router = useRouter();
  const { addItemToCart } = useCartStore();

  const [product, setProduct] = useState<CompleteProduct | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [loading, setLoading] = useState(true);

  const productId = params?.id as string;

  useEffect(() => {
    if (!productId) return;

    async function fetchIndividualProduct() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*, product_variants(*)')
          .eq('id', productId)
          .single();

        if (error) throw error;

        if (data) {
          const formatted: CompleteProduct = {
            ...data,
            variants: data.product_variants || []
          };
          setProduct(formatted);
          
          // Auto-select the first variation that actually has stock left
          const activeStockVariant = formatted.variants.find(v => v.stock_quantity > 0);
          if (activeStockVariant) setSelectedVariant(activeStockVariant);
        }
      } catch (err) {
        console.error("Error retrieving dynamic product fields:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchIndividualProduct();
  }, [productId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-between text-center bg-white text-slate-500 font-mono text-sm w-full p-20 animate-pulse">
        [ RETRIEVING GARMENT PROPERTIES & SPECIFICATIONS... ]
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white text-slate-800 p-6 space-y-4">
        <p className="font-bold text-sm text-rose-500">[ ERROR 404: APPAREL ID NOT LOCATED ]</p>
        <button onClick={() => router.push('/')} className="text-xs font-bold text-slate-500 underline">Return to Main Marketplace</button>
      </div>
    );
  }

  const handleAddToBag = () => {
    if (!selectedVariant) return;
    addItemToCart(product, selectedVariant);
    alert(`🎉 Added ${product.name} (Size: ${selectedVariant.size}) to your bag!`);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans pb-20">
      
      {/* HEADER BREADCRUMB STRIP */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-4 bg-white/50 sticky top-0 z-40 backdrop-blur-md">
        <button onClick={() => router.push('/')} className="p-1 hover:bg-slate-50 rounded-full transition text-slate-600">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {product.brand} / {product.name}
        </span>
      </div>

      {/* CORE DISPLAY WINDOW SECTION */}
      <main className="max-w-6xl mx-auto px-6 mt-8 grid grid-cols-1 md:grid-cols-12 gap-10">
        
        {/* LEFT COLUMN: HERO IMAGE BOX */}
        <div className="md:col-span-6 bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 aspect-[3/4] relative">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-between text-slate-300 text-xs font-bold p-12 text-center">Image Asset Unavailable</div>
          )}
        </div>

        {/* RIGHT COLUMN: INTERACTIVE PURCHASING DETAIL MECHANICS */}
        <div className="md:col-span-6 space-y-6 py-2">
          <div className="space-y-2">
            <span className="text-xs font-black tracking-widest text-rose-600 uppercase bg-rose-50 px-2.5 py-1 rounded">
              {product.brand}
            </span>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-tight">
              {product.name}
            </h1>
            <div className="flex items-center gap-1.5 text-amber-500 text-xs font-bold pt-1">
              <Star className="w-4 h-4 fill-amber-500 stroke-none" /> 4.4 <span className="text-slate-400 font-normal ml-1">| 2.3k Ratings</span>
            </div>
          </div>

          {/* FINANCIAL COUNTER MATRICES */}
          <div className="border-t border-slate-100 pt-4 space-y-1">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-black text-slate-900">₹{product.base_price}</span>
              <span className="text-slate-400 text-sm line-through">₹{Math.round(product.base_price * 1.4)}</span>
              <span className="text-sm font-extrabold text-rose-500">(40% OFF)</span>
            </div>
            <p className="text-[10px] text-emerald-600 font-bold">Inclusive of all transactional taxes</p>
          </div>

          {/* SIZES VARIATION CHIPS GRID */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex justify-between text-xs font-bold tracking-wider uppercase text-slate-500">
              <span>Select Garment Size</span>
              <span className="text-rose-500 underline normal-case cursor-pointer">Size Chart Guide</span>
            </div>
            
            <div className="flex flex-wrap gap-2.5">
              {product.variants.map((v) => {
                const isSelected = selectedVariant?.id === v.id;
                const hasStock = v.stock_quantity > 0;
                
                return (
                  <button
                    key={v.id}
                    disabled={!hasStock}
                    onClick={() => setSelectedVariant(v)}
                    className={`h-12 px-5 text-xs font-black tracking-wider rounded-xl border transition flex items-center justify-center min-w-[54px] ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/20'
                        : hasStock
                        ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-800'
                        : 'border-slate-100 bg-slate-50 text-slate-300 line-through cursor-not-allowed'
                    }`}
                  >
                    {v.size}
                  </button>
                );
              })}
            </div>
            {selectedVariant && (
              <p className="text-[10px] font-mono text-slate-400 pt-1">
                [ Selected SKU Color: <span className="text-slate-700 font-bold">{selectedVariant.color}</span> | Available Inventory: <span className="text-slate-700 font-bold">{selectedVariant.stock_quantity} units</span> ]
              </p>
            )}
          </div>

          {/* ACTION BUTTON PACK */}
          <div className="pt-2 flex gap-4">
            <button
              onClick={handleAddToBag}
              disabled={!selectedVariant}
              className="flex-1 h-14 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-extrabold text-sm tracking-wider uppercase rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 transition transform active:scale-[0.99]"
            >
              <ShoppingBag className="w-4 h-4 stroke-[2.5]" /> Add to Shopping Bag
            </button>
          </div>

          {/* SPECIFICATIONS & FEATURES DESCRIPTION WINDOW */}
          <div className="border-t border-slate-100 pt-6 space-y-3">
            <h3 className="text-xs font-bold tracking-wider uppercase text-slate-500">Product Specifications</h3>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              {product.description || "Premium garment construct engineered with heavy-knit components, tailored drop profiles, and soft-touch fabric properties for absolute comfort."}
            </p>
          </div>

          {/* MERCHANDISING TRUST ANCHOR MARKS */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-4 text-center border border-slate-100/50">
            <div className="flex flex-col items-center text-slate-600 gap-1">
              <Truck className="w-4 h-4 text-slate-500" />
              <span className="text-[9px] font-bold uppercase tracking-tight">Free Delivery</span>
            </div>
            <div className="flex flex-col items-center text-slate-600 gap-1">
              <RefreshCw className="w-4 h-4 text-slate-500" />
              <span className="text-[9px] font-bold uppercase tracking-tight">14 Day Return</span>
            </div>
            <div className="flex flex-col items-center text-slate-600 gap-1">
              <ShieldCheck className="w-4 h-4 text-slate-500" />
              <span className="text-[9px] font-bold uppercase tracking-tight">100% Original</span>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
