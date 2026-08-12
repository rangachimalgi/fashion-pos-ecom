import { create } from 'zustand';
import { CompleteProduct,ProductVariant } from '../types/product';

export interface CartItem {
    product: Omit<CompleteProduct, 'variants'>;
    variant: ProductVariant;
    quantity: number;
}

interface CartState {
    cart: CartItem[];
    addItemToCart: (product: CompleteProduct, variant: ProductVariant) => void;
    removeItemFromCart: (variantId: string) => void;
    clearCart: () => void;
    getGrandTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
    cart: [],

    addItemToCart: (product, variant) => {
        set((state) => {
            const existingItemIndex = state.cart.findIndex(
                (item) => item.variant.id === variant.id
            );

            if (existingItemIndex > -1) {
                const updatedCart = [...state.cart];
                updatedCart[existingItemIndex].quantity += 1;
                return { cart: updatedCart };
            }

            const { variants, ...parentProductDetails } = product;
            return {
                cart: [...state.cart, { product: parentProductDetails, variant, quantity: 1 }],
            };
        });
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
}));
