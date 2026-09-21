"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { CompleteProduct, ProductVariant } from '@/types/product';
import { AppHeader } from '@/components/store/AppHeader';
import { ExploreBannerSlider } from '@/components/store/ExploreBannerSlider';
import { NewArrivalsSlider } from '@/components/store/NewArrivalsSlider';
import { CategorySection } from '@/components/store/CategorySection';
import {
  parseDepartmentSlug,
  productMatchesDepartment,
  type StoreDepartment,
} from '@/lib/categories';

function CustomerStorefrontInner() {
  const searchParams = useSearchParams();
  const departmentFromUrl = parseDepartmentSlug(searchParams.get('department') ?? '');

  const [products, setProducts] = useState<CompleteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<StoreDepartment>(
    departmentFromUrl ?? 'Men'
  );

  useEffect(() => {
    if (departmentFromUrl) {
      setSelectedDepartment(departmentFromUrl);
    }
  }, [departmentFromUrl]);

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

  const scopedProducts = useMemo(() => {
    return products.filter((product) =>
      productMatchesDepartment(product, selectedDepartment)
    );
  }, [products, selectedDepartment]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return scopedProducts;

    return scopedProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.brand.toLowerCase().includes(query) ||
        product.variants.some((v) => v.color.toLowerCase().includes(query))
    );
  }, [scopedProducts, searchQuery]);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <AppHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedDepartment={selectedDepartment}
      />

      <ExploreBannerSlider department={selectedDepartment} />

      <NewArrivalsSlider
        products={filteredProducts}
        loading={loading}
        searchQuery={searchQuery}
        totalCount={scopedProducts.length}
        category={`${selectedDepartment} · New Arrivals`}
        layout="carousel"
        onClearSearch={() => setSearchQuery('')}
      />

      <CategorySection department={selectedDepartment} />

      <footer className="border-t border-slate-100 px-6 py-6">
        <div className="flex justify-center text-xs text-slate-400">
          <span className="font-black tracking-widest text-slate-700">
            VIBE<span className="text-brand">WEAR</span>
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function CustomerStorefront() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-white" />}>
      <CustomerStorefrontInner />
    </React.Suspense>
  );
}
