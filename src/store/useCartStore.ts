import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CompleteProduct, ProductVariant } from '../types/product';

export interface CartItem {
    product: Omit<CompleteProduct, 'variants'>;
    variant: ProductVariant;
    quantity: number;
}

interface CartState {
    cart: CartItem[];
    isBagOpen: boolean;
    openBag: () => void;
    closeBag: () => void;
    toggleBag: () => void;
    addItemToCart: (product: CompleteProduct, variant: ProductVariant) => void;
    incrementItem: (variantId: string) => void;
    decrementItem: (variantId: string) => void;
    removeItemFromCart: (variantId: string) => void;
    clearCart: () => void;
    getGrandTotal: () => number;
    getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            cart: [],
            isBagOpen: false,

            openBag: () => set({ isBagOpen: true }),
            closeBag: () => set({ isBagOpen: false }),
            toggleBag: () => set((state) => ({ isBagOpen: !state.isBagOpen })),

            addItemToCart: (product, variant) => {
                set((state) => {
                    const existingItemIndex = state.cart.findIndex(
                        (item) => item.variant.id === variant.id
                    );

                    if (existingItemIndex > -1) {
                        const existing = state.cart[existingItemIndex];
                        if (existing.quantity >= variant.stock_quantity) {
                            return { cart: state.cart, isBagOpen: true };
                        }

                        const updatedCart = [...state.cart];
                        updatedCart[existingItemIndex] = {
                            ...existing,
                            quantity: existing.quantity + 1,
                        };
                        return { cart: updatedCart, isBagOpen: true };
                    }

                    const { variants, ...parentProductDetails } = product;
                    return {
                        isBagOpen: true,
                        cart: [
                            ...state.cart,
                            { product: parentProductDetails, variant, quantity: 1 },
                        ],
                    };
                });
            },

            incrementItem: (variantId) => {
                set((state) => ({
                    cart: state.cart.map((item) => {
                        if (item.variant.id !== variantId) return item;
                        if (item.quantity >= item.variant.stock_quantity) return item;
                        return { ...item, quantity: item.quantity + 1 };
                    }),
                }));
            },

            decrementItem: (variantId) => {
                set((state) => ({
                    cart: state.cart
                        .map((item) =>
                            item.variant.id === variantId
                                ? { ...item, quantity: item.quantity - 1 }
                                : item
                        )
                        .filter((item) => item.quantity > 0),
                }));
            },

            removeItemFromCart: (variantId) => {
                set((state) => ({
                    cart: state.cart.filter((item) => item.variant.id !== variantId),
                }));
            },

            clearCart: () => set({ cart: [] }),

            getGrandTotal: () => {
                return get().cart.reduce(
                    (sum, item) => sum + item.product.base_price * item.quantity,
                    0
                );
            },

            getItemCount: () => {
                return get().cart.reduce((sum, item) => sum + item.quantity, 0);
            },
        }),
        {
            name: 'vibewear-cart',
            partialize: (state) => ({ cart: state.cart }),
        }
    )
);
