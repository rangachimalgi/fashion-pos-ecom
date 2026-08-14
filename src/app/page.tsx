"use client";
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { CompleteProduct, ProductVariant } from '@/types/product';
import { useCartStore } from '@/store/useCartStore';
import { Search, Heart, User, Sparkles, Check } from 'lucide-react';
import { BagButton } from '@/components/cart/CartDrawer';

export default function CustomerStorefront() {
  const router = useRouter();
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
      
      {/* 1. PREMIUM STICKY NAVIGATION HEADER */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-12">
          <span className="text-xl font-black tracking-widest text-slate-900 cursor-pointer flex items-center gap-1.5">
            VIBE<span className="text-rose-500 font-medium">WEAR</span>
          </span>
          <nav className="hidden md:flex items-center gap-8 text-xs font-bold tracking-wider uppercase text-slate-600">
            <span className="hover:text-rose-500 cursor-pointer transition">Men</span>
            <span className="hover:text-rose-500 cursor-pointer transition">Women</span>
            <span className="hover:text-rose-500 cursor-pointer transition">Kids</span>
            <span className="hover:text-rose-500 cursor-pointer transition">New Launches</span>
          </nav>
        </div>

        <div className="hidden sm:flex items-center bg-slate-50 border border-slate-200/60 rounded-full px-4 py-2 w-80 gap-3 focus-within:border-slate-400 transition">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for apparel, brands or styles..."
            className="bg-transparent border-none outline-none text-xs w-full text-slate-700 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-6 text-slate-700">
          <div className="flex flex-col items-center cursor-pointer hover:text-rose-500 transition">
            <User className="w-5 h-5 stroke-[1.5]" />
            <span className="text-[10px] font-bold mt-1 uppercase tracking-tight">Profile</span>
          </div>
          <div className="flex flex-col items-center cursor-pointer hover:text-rose-500 transition">
            <Heart className="w-5 h-5 stroke-[1.5]" />
            <span className="text-[10px] font-bold mt-1 uppercase tracking-tight">Wishlist</span>
          </div>
          <BagButton />
        </div>
      </header>

      {/* 2. TRENDING CAMPAIGN HERO BANNER */}
      <section className="px-6 py-6">
        <div className="bg-gradient-to-r from-amber-50 via-rose-50 to-purple-50 rounded-2xl p-8 md:p-12 relative overflow-hidden flex flex-col justify-center min-h-[260px] border border-rose-100/30">
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
              <button
                onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs tracking-wider uppercase px-6 py-3 rounded-lg shadow-sm transition active:scale-95"
              >
                Explore Collection
              </button>
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-rose-300/10 rounded-full blur-2xl pointer-events-none"></div>
          <div className="absolute right-20 -top-10 w-48 h-48 bg-purple-300/10 rounded-full blur-2xl pointer-events-none"></div>
        </div>
      </section>

      {/* 3. PREMIUM PRODUCT MATRIX SECTION */}
      <main id="catalog" className="px-6 py-8 space-y-6">
        <div className="flex justify-between items-baseline border-b border-slate-100 pb-4">
          <h2 className="text-lg font-black uppercase tracking-wider text-slate-900">
            Trending Additions{' '}
            <span className="text-slate-400 font-normal text-sm font-mono">
              ({filteredProducts.length}{searchQuery ? ` of ${products.length}` : ''})
            </span>
          </h2>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs font-bold text-slate-500 hover:text-rose-500 transition"
            >
              Clear search
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="space-y-3 animate-pulse">
                <div className="bg-slate-100 rounded-xl aspect-[3/4] w-full"></div>
                <div className="h-3 bg-slate-100 rounded w-1/3"></div>
                <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                <div className="h-3 bg-slate-100 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200 max-w-md mx-auto space-y-3">
            <p className="font-bold text-slate-500 text-sm">
              {searchQuery ? '[ NO MATCHES FOR YOUR SEARCH ]' : '[ STOCK INVENTORY POOL EMPTY ]'}
            </p>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              {searchQuery
                ? 'Try a different brand, style, or color keyword.'
                : 'Products will appear here once the catalog is synced from Supabase.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs font-bold text-rose-500 hover:underline"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <div key={product.id} className="group relative space-y-3">
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/product/${product.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') router.push(`/product/${product.id}`);
                  }}
                  className="bg-slate-50 rounded-xl aspect-[3/4] overflow-hidden border border-slate-100 relative shadow-sm transition duration-300 group-hover:shadow-md cursor-pointer"
                >
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs font-bold bg-slate-100 p-6 text-center">
                      No Imagery Available
                    </div>
                  )}
                  <span className="absolute top-3 left-3 bg-white text-slate-900 text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-sm tracking-wider">
                    {product.brand}
                  </span>
                </div>

                <div className="space-y-1 px-1">
                  <h3
                    onClick={() => router.push(`/product/${product.id}`)}
                    className="font-extrabold text-sm text-slate-900 tracking-tight truncate group-hover:text-rose-500 transition cursor-pointer"
                  >
                    {product.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-slate-900">₹{product.base_price}</span>
                    <span className="text-[10px] text-slate-400 line-through">₹{Math.round(product.base_price * 1.4)}</span>
                    <span className="text-[10px] text-rose-500 font-extrabold">(40% OFF)</span>
                  </div>

                  <p className="text-[10px] text-slate-400 font-medium pt-0.5">Tap a size to add to bag</p>
                  <div className="pt-1 flex flex-wrap gap-1">
                    {product.variants.map((variant) => {
                      const inStock = variant.stock_quantity > 0;
                      const justAdded = addedVariantId === variant.id;

                      return (
                        <button
                          key={variant.id}
                          type="button"
                          disabled={!inStock}
                          onClick={() => handleAddToCart(product, variant)}
                          title={inStock ? `${variant.size} · ${variant.color}` : 'Out of stock'}
                          className={`text-[9px] font-black px-1.5 py-0.5 rounded border transition flex items-center gap-0.5 ${
                            justAdded
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : inStock
                                ? 'border-slate-200 bg-white text-slate-700 hover:border-rose-500 hover:text-rose-500 cursor-pointer'
                                : 'border-slate-100 bg-slate-50 text-slate-300 line-through cursor-not-allowed'
                          }`}
                        >
                          {justAdded ? <Check className="w-2.5 h-2.5" /> : null}
                          {variant.size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 4. FOOTER */}
      <footer className="border-t border-slate-100 px-6 py-8 mt-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-400">
          <span className="font-black tracking-widest text-slate-700">
            VIBE<span className="text-rose-500">WEAR</span>
          </span>
          <p className="font-medium">Premium streetwear catalog · Synced live from Supabase</p>
          <Link href="/billing" className="font-bold text-rose-500 hover:underline uppercase tracking-wider">
            Go to POS Billing →
          </Link>
        </div>
      </footer>
    </div>
  );
}
