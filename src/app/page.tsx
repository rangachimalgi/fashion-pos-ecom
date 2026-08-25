"use client";
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { CompleteProduct, ProductVariant } from '@/types/product';
import { useCartStore } from '@/store/useCartStore';
import { Sparkles } from 'lucide-react';
import { StoreHeader } from '@/components/store/StoreHeader';
import { NewArrivalsSlider } from '@/components/store/NewArrivalsSlider';
import { Button } from '@/components/ui/button';

export default function CustomerStorefront() {
  const [products, setProducts] = useState<CompleteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [addedVariantId, setAddedVariantId] = useState<string | null>(null);
  const { addItemToCart } = useCartStore();

  useEffect(() => {
    async function fetchFashionCatalog() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*, product_variants(*)');

        if (error) throw error;

        const formattedData = data?.map((item: Record<string, unknown>) => ({
          ...item,
          variants: (item.product_variants as ProductVariant[]) || [],
        })) as CompleteProduct[] || [];

        setProducts(formattedData);
      } catch (err) {
        console.error("Database fetch exception:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchFashionCatalog();
  }, []);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return products;

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.brand.toLowerCase().includes(query) ||
        product.variants.some((v) => v.color.toLowerCase().includes(query))
    );
  }, [products, searchQuery]);

  const handleAddToCart = (product: CompleteProduct, variant: ProductVariant) => {
    if (variant.stock_quantity <= 0) return;

    addItemToCart(product, variant);
    setAddedVariantId(variant.id);
    window.setTimeout(() => setAddedVariantId(null), 1200);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      
      <StoreHeader searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      {/* Campaign hero */}
      <section className="px-6 py-6">
        <div className="bg-linear-to-r from-amber-50 via-rose-50 to-purple-50 rounded-2xl p-8 md:p-12 relative overflow-hidden flex flex-col justify-center min-h-65 border border-rose-100/30">
          <div className="max-w-md space-y-3 z-10">
            <span className="text-[10px] font-black tracking-widest text-rose-600 bg-rose-500/10 px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 uppercase">
              <Sparkles className="w-3 h-3 fill-rose-600" /> Season Launch
            </span>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 leading-tight">
              ELEVATE YOUR STREETWEAR VIBE.
            </h1>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Discover clean fits, high-quality heavy drops, and premium apparel designed to make a statement every single day.
            </p>
            <div className="pt-2">
              <Button
                onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs tracking-wider uppercase px-6 py-3 h-auto rounded-lg shadow-sm"
              >
                Explore Collection
              </Button>
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-rose-300/10 rounded-full blur-2xl pointer-events-none"></div>
          <div className="absolute right-20 -top-10 w-48 h-48 bg-purple-300/10 rounded-full blur-2xl pointer-events-none"></div>
        </div>
      </section>

      <NewArrivalsSlider
        products={filteredProducts}
        loading={loading}
        searchQuery={searchQuery}
        totalCount={products.length}
        addedVariantId={addedVariantId}
        onClearSearch={() => setSearchQuery('')}
        onAddToCart={handleAddToCart}
      />

      <footer className="border-t border-slate-100 px-6 py-8 mt-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-400">
          <span className="font-black tracking-widest text-slate-700">
            VIBE<span className="text-brand">WEAR</span>
          </span>
          <p className="font-medium">Premium streetwear catalog · Synced live from Supabase</p>
          <Link href="/billing" className="font-bold text-brand hover:underline uppercase tracking-wider">
            Go to POS Billing →
          </Link>
        </div>
      </footer>
    </div>
  );
}
