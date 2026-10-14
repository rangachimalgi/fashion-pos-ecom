import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CompleteProduct, Product } from "../types/product";

function toWishlistProduct(product: Product | CompleteProduct): Product {
  if ("variants" in product) {
    const { variants, ...rest } = product;
    return rest;
  }
  return product;
}

interface WishlistState {
  items: Product[];
  toggle: (product: Product | CompleteProduct) => void;
  remove: (productId: string) => void;
  has: (productId: string) => boolean;
  getCount: () => number;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],

      toggle: (product) => {
        const id = product.id;
        set((state) => {
          if (state.items.some((item) => item.id === id)) {
            return { items: state.items.filter((item) => item.id !== id) };
          }
          return { items: [toWishlistProduct(product), ...state.items] };
        });
      },

      remove: (productId) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== productId),
        }));
      },

      has: (productId) => get().items.some((item) => item.id === productId),

      getCount: () => get().items.length,
    }),
    {
      name: "vibewear-wishlist",
      partialize: (state) => ({ items: state.items }),
    }
  )
);
