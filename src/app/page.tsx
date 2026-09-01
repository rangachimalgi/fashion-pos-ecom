"use client";
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { CompleteProduct, ProductVariant } from '@/types/product';
import { StoreHeader } from '@/components/store/StoreHeader';
import { ExploreBannerSlider } from '@/components/store/ExploreBannerSlider';
import { NewArrivalsSlider } from '@/components/store/NewArrivalsSlider';
import { CategorySection } from '@/components/store/CategorySection';
import {
  productMatchesDepartment,
  productMatchesProductCategory,
  type ProductCategory,
  type StoreDepartment,
} from '@/lib/categories';

export default function CustomerStorefront() {
  const [products, setProducts] = useState<CompleteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<StoreDepartment>('Men');
  const [selectedProductCategory, setSelectedProductCategory] = useState<ProductCategory | null>(null);

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
    return products.filter(
      (product) =>
        productMatchesDepartment(product, selectedDepartment) &&
        productMatchesProductCategory(product, selectedProductCategory)
    );
  }, [products, selectedDepartment, selectedProductCategory]);

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

  const handleDepartmentChange = (department: StoreDepartment) => {
    setSelectedDepartment(department);
    setSelectedProductCategory(null);
    setSearchQuery('');
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleProductCategoryChange = (category: ProductCategory) => {
    setSelectedProductCategory((current) => (current === category ? null : category));
    setSearchQuery('');
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleExploreCategory = (category: ProductCategory) => {
    setSelectedProductCategory(category);
    setSearchQuery('');
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sliderLabel = selectedProductCategory
    ? `${selectedDepartment} · ${selectedProductCategory}`
    : `${selectedDepartment} · New Arrivals`;

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <StoreHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedDepartment={selectedDepartment}
        onDepartmentChange={handleDepartmentChange}
      />

      <ExploreBannerSlider onExplore={handleExploreCategory} />

      <NewArrivalsSlider
        products={filteredProducts}
        loading={loading}
        searchQuery={searchQuery}
        totalCount={scopedProducts.length}
        category={sliderLabel}
        layout={selectedProductCategory ? "grid" : "carousel"}
        onClearSearch={() => setSearchQuery('')}
      />

      <CategorySection
        selected={selectedProductCategory}
        onSelect={handleProductCategoryChange}
      />

      <footer className="border-t border-slate-100 px-6 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-400">
          <span className="font-black tracking-widest text-slate-700">
            VIBE<span className="text-brand">WEAR</span>
          </span>
          <Link href="/billing" className="font-bold text-brand hover:underline uppercase tracking-wider">
            Go to POS Billing →
          </Link>
        </div>
      </footer>
    </div>
  );
}
