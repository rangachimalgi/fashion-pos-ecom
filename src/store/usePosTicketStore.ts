import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem } from './useCartStore';
import type { CompleteProduct, ProductVariant } from '../types/product';
import { clampDiscountPercent, posLineTotal } from '@/lib/posPricing';

interface PosTicketState {
    ticket: CartItem[];
    addItemToTicket: (product: CompleteProduct, variant: ProductVariant) => void;
    incrementItem: (variantId: string) => void;
    decrementItem: (variantId: string) => void;
    removeItemFromTicket: (variantId: string) => void;
    setLineDiscount: (variantId: string, percent: number) => void;
    clearTicket: () => void;
    getGrandTotal: () => number;
    patchTicketProduct: (
      productId: string,
      fields: Partial<CompleteProduct>
    ) => void;
}

export const usePosTicketStore = create<PosTicketState>()(
    persist(
        (set, get) => ({
            ticket: [],

            addItemToTicket: (product, variant) => {
                set((state) => {
                    const existingItemIndex = state.ticket.findIndex(
                        (item) => item.variant.id === variant.id
                    );

                    if (existingItemIndex > -1) {
                        const existing = state.ticket[existingItemIndex];
                        if (existing.quantity >= variant.stock_quantity) {
                            return { ticket: state.ticket };
                        }

                        const updatedTicket = [...state.ticket];
                        updatedTicket[existingItemIndex] = {
                            ...existing,
                            quantity: existing.quantity + 1,
                        };
                        return { ticket: updatedTicket };
                    }

                    const { variants, ...parentProductDetails } = product;
                    return {
                        ticket: [
                            ...state.ticket,
                            {
                                product: parentProductDetails,
                                variant,
                                quantity: 1,
                                discountPercent: 0,
                            },
                        ],
                    };
                });
            },

            incrementItem: (variantId) => {
                set((state) => ({
                    ticket: state.ticket.map((item) => {
                        if (item.variant.id !== variantId) return item;
                        if (item.quantity >= item.variant.stock_quantity) return item;
                        return { ...item, quantity: item.quantity + 1 };
                    }),
                }));
            },

            decrementItem: (variantId) => {
                set((state) => ({
                    ticket: state.ticket
                        .map((item) =>
                            item.variant.id === variantId
                                ? { ...item, quantity: item.quantity - 1 }
                                : item
                        )
                        .filter((item) => item.quantity > 0),
                }));
            },

            removeItemFromTicket: (variantId) => {
                set((state) => ({
                    ticket: state.ticket.filter((item) => item.variant.id !== variantId),
                }));
            },

            setLineDiscount: (variantId, percent) => {
                set((state) => ({
                    ticket: state.ticket.map((item) =>
                        item.variant.id === variantId
                            ? { ...item, discountPercent: clampDiscountPercent(percent) }
                            : item
                    ),
                }));
            },

            clearTicket: () => set({ ticket: [] }),

            patchTicketProduct: (productId, fields) => {
                set((state) => ({
                    ticket: state.ticket.map((item) =>
                        item.product.id === productId
                            ? { ...item, product: { ...item.product, ...fields } }
                            : item
                    ),
                }));
            },

            getGrandTotal: () => {
                return get().ticket.reduce(
                    (sum, item) =>
                        sum +
                        posLineTotal(
                            item.product.base_price,
                            item.quantity,
                            item.discountPercent ?? 0
                        ),
                    0
                );
            },
        }),
        {
            name: 'vibewear-pos-ticket',
            partialize: (state) => ({ ticket: state.ticket }),
        }
    )
);
