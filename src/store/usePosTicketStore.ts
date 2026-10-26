import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem } from './useCartStore';
import type { CompleteProduct, ProductVariant } from '../types/product';
import type { AdminOrder } from '@/types/order';
import { clampDiscountPercent, posLineTotal } from '@/lib/posPricing';

interface PosTicketState {
    ticket: CartItem[];
    editingOrder: AdminOrder | null;
    addItemToTicket: (product: CompleteProduct, variant: ProductVariant) => void;
    incrementItem: (variantId: string) => void;
    decrementItem: (variantId: string) => void;
    removeItemFromTicket: (variantId: string) => void;
    setLineDiscount: (variantId: string, percent: number) => void;
    clearTicket: () => void;
    replaceTicket: (ticket: CartItem[]) => void;
    setEditingOrder: (order: AdminOrder | null) => void;
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
            editingOrder: null,

            addItemToTicket: (product, variant) => {
                set((state) => {
                    const existingItemIndex = state.ticket.findIndex(
                        (item) => item.variant.id === variant.id
                    );

                    if (existingItemIndex > -1) {
                        const existing = state.ticket[existingItemIndex];
                        const cap = Math.max(
                            Number(variant.stock_quantity ?? 0),
                            Number(existing.variant.stock_quantity ?? 0)
                        );
                        if (existing.quantity >= cap) {
                            return { ticket: state.ticket };
                        }

                        const updatedTicket = [...state.ticket];
                        updatedTicket[existingItemIndex] = {
                            ...existing,
                            variant: { ...existing.variant, stock_quantity: cap },
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

            clearTicket: () => set({ ticket: [], editingOrder: null }),
            replaceTicket: (ticket) => set({ ticket }),
            setEditingOrder: (order) => set({ editingOrder: order }),

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
            partialize: (state) => ({
                ticket: state.ticket,
                editingOrder: state.editingOrder,
            }),
        }
    )
);
