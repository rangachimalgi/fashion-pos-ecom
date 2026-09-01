"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { ArrowLeft, X } from 'lucide-react';
import { MAX_PRODUCT_IMAGES } from '@/lib/productImages';

interface VariantInput {
  size: 'S' | 'M' | 'L' | 'XL' | 'XXL';
  color: string;
  stock_quantity: number;
}

export default function ManualAddProduct() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const [productData, setProductData] = useState({
    name: '',
    brand: '',
    price: '',
    description: '',
    department: 'Men' as 'Men' | 'Women' | 'Kids',
    category: 'Tshirts' as 'Tshirts' | 'Shirts' | 'Jeans' | 'Hoodies',
  });

  const [variants, setVariants] = useState<VariantInput[]>([
    { size: 'M', color: 'Black', stock_quantity: 10 },
  ]);

  useEffect(() => {
    if (!imageFiles.length) {
      setImagePreviews([]);
      return;
    }

    const previewUrls = imageFiles.map((file) => URL.createObjectURL(file));
    setImagePreviews(previewUrls);

    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageFiles]);

  const handleImageSelection = (fileList: FileList | null) => {
    if (!fileList?.length) return;

    const incomingFiles = Array.from(fileList);
    const combinedFiles = [...imageFiles, ...incomingFiles].slice(0, MAX_PRODUCT_IMAGES);

    if (imageFiles.length + incomingFiles.length > MAX_PRODUCT_IMAGES) {
      alert(`You can upload up to ${MAX_PRODUCT_IMAGES} product images.`);
    }

    setImageFiles(combinedFiles);
  };

  const removeImageAt = (index: number) => {
    setImageFiles((current) => current.filter((_, i) => i !== index));
  };

  const addVariantRow = () => {
    setVariants([...variants, { size: 'M', color: 'Black', stock_quantity: 10 }]);
  };

  const removeVariantRow = (index: number) => {
    if (variants.length === 1) return;
    setVariants(variants.filter((_, i) => i !== index));
  };

  const handleVariantChange = <K extends keyof VariantInput>(
    index: number,
    field: K,
    value: VariantInput[K]
  ) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const generateUniqueBarcode = () => {
    const prefix = '890';
    const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    return prefix + randomDigits;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFiles.length) return alert('Please upload at least one product image.');

    setLoading(true);

    try {
      const uploadedImageUrls: string[] = [];

      for (const imageFile of imageFiles) {
        const fileExtension = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExtension}`;
        const filePath = `catalog/${fileName}`;

        const { error: storageError } = await supabase.storage
          .from('product-images')
          .upload(filePath, imageFile);

        if (storageError) throw storageError;

        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        uploadedImageUrls.push(urlData.publicUrl);
      }

      const publicImageUrl = uploadedImageUrls[0];

      const basePayload = {
        name: productData.name,
        brand: productData.brand,
        base_price: parseFloat(productData.price),
        description: productData.description || null,
        image_url: publicImageUrl,
        department: productData.department,
        category: productData.category,
      };

      let insertedProduct: { id: string } | null = null;
      let productError: { message?: string; code?: string } | null = null;
      let galleryColumnMissing = false;

      ({ data: insertedProduct, error: productError } = await supabase
        .from('products')
        .insert([{ ...basePayload, image_urls: uploadedImageUrls }])
        .select()
        .single());

      if (
        productError?.message?.toLowerCase().includes('image_urls') ||
        productError?.code === 'PGRST204'
      ) {
        galleryColumnMissing = true;
        ({ data: insertedProduct, error: productError } = await supabase
          .from('products')
          .insert([basePayload])
          .select()
          .single());
      }

      if (productError || !insertedProduct) {
        const hint =
          productError?.message?.toLowerCase().includes('category') ||
          productError?.message?.toLowerCase().includes('department') ||
          productError?.code === 'PGRST204'
            ? '\n\nMissing DB columns. Run the latest files in supabase/migrations/ in the Supabase SQL Editor.'
            : '';
        throw new Error((productError?.message || 'Product was not created') + hint);
      }

      const product = insertedProduct;

      const variantsToInsert = variants.map((v) => ({
        product_id: product.id,
        size: v.size,
        color: v.color,
        barcode: generateUniqueBarcode(),
        stock_quantity: v.stock_quantity,
      }));

      const { error: variantError } = await supabase
        .from('product_variants')
        .insert(variantsToInsert);

      if (variantError) throw variantError;

      if (galleryColumnMissing && uploadedImageUrls.length > 1) {
        alert(
          `Product published with the cover image only. Run supabase/migrations/003_product_image_urls.sql in the Supabase SQL Editor to enable all ${uploadedImageUrls.length} gallery images.`
        );
      } else {
        alert('Fashion item and auto-generated variant barcodes synced successfully.');
      }
      router.push('/');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(err);
      alert(`Ingestion failure: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-mono p-8">
      <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="border-b border-slate-800 pb-4 mb-6 flex justify-between items-start gap-4">
          <div>
            <h2 className="text-xl font-black text-emerald-400">MANUAL PRODUCT INGESTION DESK</h2>
            <p className="text-xs text-slate-400 mt-1 font-sans">
              Enter garment information below. The platform will automatically stamp unique barcodes for every size row.
            </p>
          </div>
          <Link
            href="/billing"
            className="text-xs font-bold text-slate-400 hover:text-emerald-400 transition flex items-center gap-1.5 shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to POS
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400">GARMENT TITLE</label>
              <input
                type="text"
                required
                value={productData.name}
                onChange={(e) => setProductData({ ...productData, name: e.target.value })}
                placeholder="e.g., Oversized Heavyweight Tee"
                className="bg-slate-800 border border-slate-700 rounded-lg h-10 px-3 text-sm focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400">BRAND / LABEL</label>
              <input
                type="text"
                required
                value={productData.brand}
                onChange={(e) => setProductData({ ...productData, brand: e.target.value })}
                placeholder="e.g., VibeWear Original"
                className="bg-slate-800 border border-slate-700 rounded-lg h-10 px-3 text-sm focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400">BASE PRICE (INR)</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={productData.price}
                onChange={(e) => setProductData({ ...productData, price: e.target.value })}
                placeholder="1999"
                className="bg-slate-800 border border-slate-700 rounded-lg h-10 px-3 text-sm focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400">DEPARTMENT</label>
              <select
                required
                value={productData.department}
                onChange={(e) =>
                  setProductData({
                    ...productData,
                    department: e.target.value as 'Men' | 'Women' | 'Kids',
                  })
                }
                className="bg-slate-800 border border-slate-700 rounded-lg h-10 px-3 text-sm focus:outline-none focus:border-emerald-500 text-white font-mono"
              >
                <option value="Men">Men</option>
                <option value="Women">Women</option>
                <option value="Kids">Kids</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400">CATEGORY</label>
              <select
                required
                value={productData.category}
                onChange={(e) =>
                  setProductData({
                    ...productData,
                    category: e.target.value as 'Tshirts' | 'Shirts' | 'Jeans' | 'Hoodies',
                  })
                }
                className="bg-slate-800 border border-slate-700 rounded-lg h-10 px-3 text-sm focus:outline-none focus:border-emerald-500 text-white font-mono"
              >
                <option value="Tshirts">Tshirts</option>
                <option value="Shirts">Shirts</option>
                <option value="Jeans">Jeans</option>
                <option value="Hoodies">Hoodies</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-slate-400">
                PRODUCT IMAGES ({imageFiles.length}/{MAX_PRODUCT_IMAGES})
              </label>
              <input
                type="file"
                required={imageFiles.length === 0}
                accept="image/*"
                multiple
                disabled={imageFiles.length >= MAX_PRODUCT_IMAGES}
                onChange={(e) => {
                  handleImageSelection(e.target.files);
                  e.target.value = '';
                }}
                className="bg-slate-800 border border-slate-700 rounded-lg file:h-full file:bg-slate-700 file:border-none file:text-emerald-400 file:font-mono file:text-xs file:px-3 text-xs flex items-center h-10 cursor-pointer text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-[10px] text-slate-500 font-sans">
                Upload up to {MAX_PRODUCT_IMAGES} images. The first image becomes the catalog cover.
              </p>
            </div>
          </div>

          {imagePreviews.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {imagePreviews.map((preview, index) => (
                <div
                  key={preview}
                  className="relative rounded-xl border border-slate-800 overflow-hidden bg-slate-950/40 aspect-square"
                >
                  <img
                    src={preview}
                    alt={`Product preview ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImageAt(index)}
                    aria-label={`Remove image ${index + 1}`}
                    className="absolute top-2 right-2 rounded-full bg-slate-950/80 p-1 text-slate-300 hover:text-rose-400 transition"
                  >
                    <X className="size-3.5" />
                  </button>
                  {index === 0 && (
                    <span className="absolute bottom-2 left-2 rounded bg-emerald-500/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-950">
                      Cover
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400">ITEM DESCRIPTION (OPTIONAL)</label>
            <textarea
              rows={2}
              value={productData.description}
              onChange={(e) => setProductData({ ...productData, description: e.target.value })}
              placeholder="100% loopback knit cotton, 280 GSM relax fit construct profile..."
              className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
            />
          </div>

          <div className="border-t border-slate-800 pt-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black text-slate-400">[ STOCK MATRIX COMBINATIONS ]</span>
              <button
                type="button"
                onClick={addVariantRow}
                className="text-xs font-bold border border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 px-3 py-1.5 rounded transition"
              >
                + Add Size/Color Line
              </button>
            </div>

            <div className="space-y-3">
              {variants.map((v, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-3 items-end bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl"
                >
                  <div className="col-span-3 flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500">SIZE</label>
                    <select
                      value={v.size}
                      onChange={(e) =>
                        handleVariantChange(index, 'size', e.target.value as VariantInput['size'])
                      }
                      className="bg-slate-800 border border-slate-700 rounded-lg h-9 px-2 text-xs focus:outline-none focus:border-emerald-500 text-white font-mono"
                    >
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                      <option value="XXL">XXL</option>
                    </select>
                  </div>
                  <div className="col-span-4 flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500">COLORWAY</label>
                    <input
                      type="text"
                      required
                      value={v.color}
                      onChange={(e) => handleVariantChange(index, 'color', e.target.value)}
                      placeholder="e.g., Cobalt Blue"
                      className="bg-slate-800 border border-slate-700 rounded-lg h-9 px-3 text-xs focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                  <div className="col-span-3 flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500">INITIAL QTY</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={v.stock_quantity}
                      onChange={(e) =>
                        handleVariantChange(index, 'stock_quantity', parseInt(e.target.value, 10) || 0)
                      }
                      className="bg-slate-800 border border-slate-700 rounded-lg h-9 px-3 text-xs focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                  <div className="col-span-2 text-right">
                    <button
                      type="button"
                      disabled={variants.length === 1}
                      onClick={() => removeVariantRow(index)}
                      className="h-9 w-full bg-slate-800 border border-slate-700 hover:bg-rose-950/30 hover:text-rose-400 hover:border-rose-900 rounded-lg text-xs font-bold transition disabled:opacity-30 disabled:pointer-events-none"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-black py-3.5 rounded-lg text-sm tracking-wider transition active:scale-[0.99]"
            >
              {loading ? 'SYNCING TO SUPABASE...' : 'PUBLISH PRODUCT TO CATALOG'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/billing')}
              disabled={loading}
              className="sm:w-40 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-300 font-bold py-3.5 rounded-lg text-sm transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

