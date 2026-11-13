"use client";
import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePosTicketStore } from '@/store/usePosTicketStore';
import { supabase } from '@/lib/supabaseClient';
import { placeOrder } from '@/lib/placeOrder';
import { lookupPosByEan } from '@/lib/posLookup';
import { discountedUnitPrice, maxDiscountForMargin, posLineTotal } from '@/lib/posPricing';
import { buildPosReceipt, type PosReceipt } from '@/lib/posReceipt';
import {
  reservedQtyOnOrder,
  ticketFromOrder,
  updatePosOrder,
} from '@/lib/posOrderMutations';
import {
  EXCHANGE_WINDOW_DAYS,
  canExchangeOrder,
  exchangeCredit,
  exchangePosOrder,
  fetchExchangeAvailability,
  type ExchangeAvailability,
} from '@/lib/posExchange';
import { formatInr, shortOrderId } from '@/lib/formatOrder';
import { todayInShop } from '@/lib/salesReport';
import { getStaffProfile, signOutStaff, type StaffRole } from '@/lib/staffAuth';
import { DISCOUNT_CAP_PERCENT, ROLE_LABEL } from '@/lib/staffRoles';
import { countPendingDeleteRequests } from '@/lib/deleteRequests';
import { listSalesPeople, type SalesPerson } from '@/lib/salesPeople';
import { cashDueFor, DEFAULT_DENOMINATIONS, fetchDrawerTotal, listCashDenominations } from '@/lib/cashLedger';
import { CashLedgerPanel } from '@/components/pos/CashLedgerPanel';
import { CashTender, useCashTender } from '@/components/pos/CashTender';
import { DeleteRequestsPanel } from '@/components/pos/DeleteRequestsPanel';
import { PosSearchSuggestions } from '@/components/pos/PosSearchSuggestions';
import { PosReceiptPreview } from '@/components/pos/PosReceiptPreview';
import { PosHistoryPanel } from '@/components/pos/PosHistoryPanel';
import type { CartItem } from '@/store/useCartStore';
import type { AdminOrder, PaymentMethod } from '@/types/order';
import type { CompleteProduct, ProductVariant } from '@/types/product';
import { useRouter } from 'next/navigation';

export default function BillingTerminal() {
  const router = useRouter();
  const {
    ticket,
    addItemToTicket,
    incrementItem,
    decrementItem,
    removeItemFromTicket,
    setLineDiscount,
    getGrandTotal,
    clearTicket,
    replaceTicket,
    setEditingOrder,
    editingOrder,
    patchTicketProduct,
  } = usePosTicketStore();
  const [paymentMode, setPaymentMode] = useState<PaymentMethod>('CASH');
  const [stashedSale, setStashedSale] = useState<{
    ticket: CartItem[];
    payment: PaymentMethod;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [eanInput, setEanInput] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [salesPeople, setSalesPeople] = useState<SalesPerson[]>([]);
  const [pickedSalesPersonId, setPickedSalesPersonId] = useState('');
  const [staffLabel, setStaffLabel] = useState('');
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [receiptPosted, setReceiptPosted] = useState(false);
  const [deskView, setDeskView] = useState<'sale' | 'history' | 'requests' | 'cash'>('sale');
  const [denominations, setDenominations] = useState<number[]>(DEFAULT_DENOMINATIONS);
  const [drawerTotal, setDrawerTotal] = useState<number | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [exchangingOrder, setExchangingOrder] = useState<AdminOrder | null>(null);
  const [exchangeAvailability, setExchangeAvailability] = useState<ExchangeAvailability[]>([]);
  const [exchangeReturns, setExchangeReturns] = useState<Record<string, number>>({});
  const eanRef = useRef<HTMLInputElement>(null);

  const returnLines = Object.entries(exchangeReturns)
    .map(([variant_id, quantity]) => ({ variant_id, quantity }))
    .filter((line) => line.quantity > 0);
  const credit = exchangingOrder ? exchangeCredit(returnLines, exchangeAvailability) : 0;
  const newTotal = getGrandTotal();
  const amountDue = Math.max(0, Math.round((newTotal - credit) * 100) / 100);

  // Cash side of the bill: what the customer handed over and the change given.
  // Cash due is the amount the customer pays (full bill, or the exchange difference).
  const cashDue = cashDueFor(exchangingOrder ? amountDue : newTotal);
  const tender = useCashTender(cashDue, denominations);

  const refreshDrawerTotal = () => {
    fetchDrawerTotal(supabase)
      .then((total) => {
        setDrawerTotal(total);
        setDrawerError(null);
      })
      .catch((err) => {
        setDrawerTotal(null);
        setDrawerError(err instanceof Error ? err.message : 'Could not load the counter total');
      });
  };

  useEffect(() => {
    listCashDenominations(supabase)
      .then(setDenominations)
      .catch(() => setDenominations(DEFAULT_DENOMINATIONS));
  }, []);

  useEffect(() => {
    getStaffProfile()
      .then((profile) => {
        setRole(profile?.role ?? null);
        setStaffLabel(profile?.email?.split('@')[0] ?? '');
      })
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (!role) return;
    refreshDrawerTotal();
  }, [role, deskView]);

  const isAdmin = role === 'admin';

  useEffect(() => {
    listSalesPeople(supabase)
      .then(setSalesPeople)
      .catch(() => setSalesPeople([]));
  }, []);

  // Who attended this customer. When editing a bill it starts as that bill's
  // salesperson; picking someone else overrides it.
  const salesPersonId = pickedSalesPersonId || editingOrder?.sales_person_id || '';
  const activeSalesPeople = salesPeople.filter((person) => person.active);
  const selectableSalesPeople = salesPeople.filter(
    (person) => person.active || person.id === salesPersonId
  );
  const attendedName =
    salesPeople.find((person) => person.id === salesPersonId)?.name ??
    editingOrder?.attended_by ??
    staffLabel;
  // UI limit only - the database enforces the real cap per role.
  const maxDiscount = role ? DISCOUNT_CAP_PERCENT[role] : 0;

  const refreshPendingCount = () => {
    countPendingDeleteRequests(supabase).then(setPendingCount);
  };

  useEffect(() => {
    countPendingDeleteRequests(supabase).then(setPendingCount);
  }, [deskView]);

  // Biggest discount for a line: the role's cap, and never so deep that the
  // price drops below cost + 5%. (The database enforces both.)
  // When editing an existing bill, keep whatever discount it already has.
  const lineDiscountLimit = (
    variantId: string,
    mrp: number,
    cost: number | null | undefined
  ) => {
    const base = Math.min(maxDiscount, maxDiscountForMargin(mrp, cost));
    if (!editingOrder || !mrp) return base;
    const line = editingOrder.items.find((entry) => entry.variant_id === variantId);
    if (!line) return base;
    const original = Math.round((1 - Number(line.price_at_purchase) / mrp) * 100);
    return Math.max(base, original);
  };

  // A saved ticket from another login must not carry a bigger discount over.
  useEffect(() => {
    if (!role) return;
    for (const item of ticket) {
      const limit = lineDiscountLimit(
        item.variant.id,
        item.product.base_price,
        item.product.cost_price
      );
      if ((item.discountPercent ?? 0) > limit) setLineDiscount(item.variant.id, limit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, ticket, editingOrder]);

  useEffect(() => {
    eanRef.current?.focus();
  }, [ticket.length]);

  useEffect(() => {
    if (editingOrder) {
      setPaymentMode(editingOrder.payment_method === 'UPI' ? 'UPI' : 'CASH');
    }
  }, [editingOrder]);

  useEffect(() => {
    const ids = [...new Set(ticket.map((item) => item.product.id))];
    if (!ids.length) return;

    supabase
      .from("products")
      .select("id, cost_price")
      .in("id", ids)
      .then(({ data, error }) => {
        if (error || !data) return;
        for (const row of data) {
          const current = ticket.find((item) => item.product.id === row.id);
          if (!current) continue;
          const nextCost =
            row.cost_price == null ? null : Number(row.cost_price);
          if (current.product.cost_price !== nextCost) {
            patchTicketProduct(row.id, { cost_price: nextCost });
          }
        }
      });
  }, [ticket, patchTicketProduct]);

  // Shared by the EAN scan and the search suggestions. Returns false (and says
  // why) when the piece can't be added.
  const addVariantToTicket = (product: CompleteProduct, variant: ProductVariant) => {
    const available =
      Number(variant.stock_quantity ?? 0) + reservedQtyOnOrder(editingOrder, variant.id);

    if (available <= 0) {
      setLookupError(
        `${product.name} · ${variant.size} is out of stock (MRP ₹${product.base_price})`
      );
      return false;
    }

    const already = ticket.find((item) => item.variant.id === variant.id);
    if (already && already.quantity >= available) {
      setLookupError(`Only ${available} in stock for ${product.name} · ${variant.size}`);
      return false;
    }

    addItemToTicket(
      {
        ...product,
        cost_price: product.cost_price == null ? null : Number(product.cost_price),
      },
      { ...variant, stock_quantity: available }
    );
    return true;
  };

  const handlePick = (product: CompleteProduct, variant: ProductVariant) => {
    setLookupError(null);
    if (addVariantToTicket(product, variant)) {
      setEanInput('');
      setSuggestOpen(false);
      setStatus(`${product.name} · ${variant.size} · MRP ₹${product.base_price} added`);
    }
    eanRef.current?.focus();
  };

  const handleLookup = async (event?: FormEvent) => {
    event?.preventDefault();
    const code = eanInput.trim();
    if (!code || lookingUp) return;

    setLookingUp(true);
    setLookupError(null);
    setStatus(null);

    try {
      const hit = await lookupPosByEan(supabase, code);
      if (!hit) {
        setLookupError(`No product for “${code}”. Pick one from the suggestions, or check the code.`);
        return;
      }
      if (!addVariantToTicket(hit.product, hit.variant)) return;
      setEanInput('');
      setStatus(
        `${hit.product.name} · ${hit.variant.size} · MRP ₹${hit.product.base_price}${
          hit.product.cost_price != null ? ` · cost ₹${hit.product.cost_price}` : ""
        } added`
      );
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLookingUp(false);
      eanRef.current?.focus();
    }
  };

  // A bill that was already paid in cash for this same amount keeps the cash it
  // recorded; anything else paid in cash needs the notes/coins entered.
  const cashUnchanged =
    Boolean(editingOrder) &&
    !exchangingOrder &&
    editingOrder?.payment_method === 'CASH' &&
    cashDueFor(Number(editingOrder?.total_amount ?? 0)) === cashDue;
  // Even exchange (due ₹0) needs no cash counts.
  const needsCashEntry = paymentMode === 'CASH' && !cashUnchanged && cashDue > 0;

  const receiptAt = editingOrder?.created_at
    ? new Date(editingOrder.created_at)
    : undefined;

  const openReceipt = (orderId: string, posted: boolean, extras?: {
    exchangeOfBillNo?: string | null;
    exchangeCredit?: number | null;
    amountDue?: number | null;
  }) => {
    setReceipt(
      buildPosReceipt(ticket, {
        orderId,
        payment: paymentMode,
        attendedBy: attendedName,
        at: receiptAt,
        exchangeOfBillNo: extras?.exchangeOfBillNo,
        exchangeCredit: extras?.exchangeCredit,
        amountDue: extras?.amountDue,
      })
    );
    setReceiptPosted(posted);
  };

  const beginEdit = async (order: AdminOrder) => {
    setLookupError(null);
    setStatus(null);
    try {
      const nextTicket = await ticketFromOrder(supabase, order);
      if (!editingOrder && !exchangingOrder && ticket.length > 0) {
        setStashedSale({ ticket, payment: paymentMode });
      }
      replaceTicket(nextTicket);
      setEditingOrder(order);
      setExchangingOrder(null);
      setExchangeAvailability([]);
      setExchangeReturns({});
      setPickedSalesPersonId('');
      tender.reset();
      setPaymentMode(order.payment_method === 'UPI' ? 'UPI' : 'CASH');
      setDeskView('sale');
      setStatus(`Editing bill ${shortOrderId(order.id)}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not open that bill');
      setDeskView('sale');
    }
  };

  const beginExchange = async (order: AdminOrder) => {
    setLookupError(null);
    setStatus(null);
    const gate = canExchangeOrder(order, todayInShop());
    if (!gate.ok) {
      setStatus(gate.reason);
      return;
    }
    try {
      const availability = await fetchExchangeAvailability(supabase, order.id);
      const open = availability.filter((row) => row.available > 0);
      if (!open.length) {
        setStatus('Nothing left to exchange on this bill — it was already fully exchanged.');
        return;
      }
      if (!editingOrder && !exchangingOrder && ticket.length > 0) {
        setStashedSale({ ticket, payment: paymentMode });
      }
      replaceTicket([]);
      setEditingOrder(null);
      setExchangingOrder(order);
      setExchangeAvailability(availability);
      setExchangeReturns({});
      setPickedSalesPersonId('');
      tender.reset();
      setPaymentMode('CASH');
      setDeskView('sale');
      setStatus(`Exchange of bill ${shortOrderId(order.id)} — pick pieces coming back, then scan the new ones.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not start the exchange');
    }
  };

  const cancelEdit = () => {
    if (stashedSale) {
      replaceTicket(stashedSale.ticket);
      setPaymentMode(stashedSale.payment);
      setStashedSale(null);
    } else {
      replaceTicket([]);
    }
    setEditingOrder(null);
    setExchangingOrder(null);
    setExchangeAvailability([]);
    setExchangeReturns({});
    setPickedSalesPersonId('');
    tender.reset();
    setStatus(null);
    setDeskView('history');
  };

  const handlePreviewBill = () => {
    if (ticket.length === 0) return;
    openReceipt(editingOrder?.id ?? exchangingOrder?.id ?? 'preview', false, exchangingOrder ? {
      exchangeOfBillNo: shortOrderId(exchangingOrder.id),
      exchangeCredit: credit,
      amountDue,
    } : undefined);
  };

  const handleCloseInvoice = async () => {
    if (ticket.length === 0 || submitting) return;

    if (activeSalesPeople.length > 0 && !salesPersonId) {
      setStatus('Choose who attended this customer.');
      return;
    }

    if (exchangingOrder) {
      if (!returnLines.length) {
        setStatus('Pick at least one piece coming back from the original bill.');
        return;
      }
      if (newTotal + 0.001 < credit) {
        setStatus(`No cash refund on exchange. New items ₹${newTotal} must cover credit ₹${credit}.`);
        return;
      }
    }

    if (needsCashEntry && !tender.valid) {
      setStatus(tender.problem);
      return;
    }
    const cash = needsCashEntry ? tender.payload() : {};

    setSubmitting(true);
    setStatus(null);

    try {
      const snapshot = ticket;
      const attended = attendedName;
      const items = snapshot.map((item) => ({
        variant_id: item.variant.id,
        quantity: item.quantity,
        unit_price: discountedUnitPrice(
          item.product.base_price,
          item.discountPercent ?? 0
        ),
      }));

      let orderId: string;
      let postedCredit: number | null = null;
      let postedDue: number | null = null;
      let exchangeOfBillNo: string | null = null;

      if (exchangingOrder) {
        if (!returnLines.length) {
          setStatus('Pick at least one piece coming back from the original bill.');
          setSubmitting(false);
          return;
        }
        if (amountDue < 0 || newTotal + 0.001 < credit) {
          setStatus(
            `No cash refund on exchange. New items ₹${newTotal} must cover credit ₹${credit}.`
          );
          setSubmitting(false);
          return;
        }
        const result = await exchangePosOrder(supabase, {
          originalOrderId: exchangingOrder.id,
          returns: returnLines,
          newItems: items,
          payment_method: paymentMode,
          sales_person_id: salesPersonId || null,
          ...cash,
        });
        orderId = result.order_id;
        postedCredit = result.credit;
        postedDue = result.due;
        exchangeOfBillNo = shortOrderId(exchangingOrder.id);
        setStatus(
          result.due > 0
            ? `Exchange posted · customer pays ₹${result.due} via ${paymentMode}`
            : `Exchange posted · even swap, nothing to pay`
        );
      } else if (editingOrder) {
        await updatePosOrder(supabase, editingOrder, {
          payment_method: paymentMode,
          items,
          sales_person_id: salesPersonId || null,
          ...cash,
        });
        orderId = editingOrder.id;
        setStatus(`Invoice ${shortOrderId(orderId)} updated via ${paymentMode}`);
      } else {
        const payload = await placeOrder(supabase, {
          payment_method: paymentMode,
          source: 'POS',
          items,
          sales_person_id: salesPersonId || null,
          ...cash,
        });
        orderId = payload.order_id;
        setStatus(`Invoice ${orderId} posted via ${paymentMode}`);
      }

      setReceipt(
        buildPosReceipt(snapshot, {
          orderId,
          payment: paymentMode,
          attendedBy: attended,
          at: editingOrder?.created_at ? new Date(editingOrder.created_at) : undefined,
          exchangeOfBillNo,
          exchangeCredit: postedCredit,
          amountDue: postedDue,
        })
      );
      setReceiptPosted(true);
      setPickedSalesPersonId('');
      tender.reset();
      setStashedSale(null);
      const goHistory = Boolean(editingOrder || exchangingOrder);
      clearTicket();
      setExchangingOrder(null);
      setExchangeAvailability([]);
      setExchangeReturns({});
      refreshDrawerTotal();
      if (goHistory) setDeskView('history');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-white font-mono p-6 gap-6 print:block print:h-auto print:bg-white print:p-0">
      
      {/* LEFT WINDOW: CURRENT ACTIVE BILLING TRANSACTION */}
      <div className="flex flex-1 flex-col rounded-xl border border-slate-700 bg-slate-800 p-6 print:hidden">
        <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-extrabold text-emerald-400 tracking-wider">🛒 COUNTER POS DESK</h2>
            <div className="flex rounded-lg border border-slate-600 p-0.5">
              <button
                type="button"
                onClick={() => setDeskView('sale')}
                className={`rounded-md px-3 py-1 text-[11px] font-black tracking-wider ${
                  deskView === 'sale' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                SALE
              </button>
              <button
                type="button"
                onClick={() => setDeskView('history')}
                className={`rounded-md px-3 py-1 text-[11px] font-black tracking-wider ${
                  deskView === 'history' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                HISTORY
              </button>
              <button
                type="button"
                onClick={() => setDeskView('requests')}
                className={`rounded-md px-3 py-1 text-[11px] font-black tracking-wider ${
                  deskView === 'requests' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                REQUESTS
                {pendingCount > 0 ? (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-px text-[10px] text-slate-900">
                    {pendingCount}
                  </span>
                ) : null}
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setDeskView('cash')}
                  className={`rounded-md px-3 py-1 text-[11px] font-black tracking-wider ${
                    deskView === 'cash' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                  }`}
                >
                  CASH
                </button>
              ) : null}
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
              <p className="font-sans text-[10px] uppercase tracking-wider text-slate-400">
                In counter
              </p>
              <p
                title={drawerError ?? undefined}
                className={`text-sm font-black leading-none ${
                  drawerError ? 'text-amber-300' : drawerTotal != null && drawerTotal < 0 ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                {drawerError ? 'unavailable' : drawerTotal == null ? '…' : formatInr(drawerTotal)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {role ? (
              <span className="font-sans text-[11px] text-slate-400">
                {ROLE_LABEL[role]} · max discount {maxDiscount}%
              </span>
            ) : null}
            {isAdmin ? (
              <Link
                href="/admin"
                className="bg-slate-700 hover:bg-slate-600 text-emerald-300 border border-slate-600 px-3 py-1 rounded text-xs font-bold transition"
              >
                Admin Panel
              </Link>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                await signOutStaff();
                router.replace('/login');
                router.refresh();
              }}
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 px-3 py-1 rounded text-xs font-bold transition"
            >
              Sign out
            </button>
          </div>
        </div>

        {deskView === "cash" && isAdmin ? (
          <CashLedgerPanel />
        ) : deskView === "requests" ? (
          <DeleteRequestsPanel role={role} theme="pos" onChanged={refreshPendingCount} />
        ) : deskView === "history" ? (
          <PosHistoryPanel
            attendedBy={staffLabel}
            role={role}
            onRequestsChanged={refreshPendingCount}
            onReprint={(next) => {
              setReceipt(next);
              setReceiptPosted(true);
            }}
            onEdit={beginEdit}
            onExchange={beginExchange}
          />
        ) : (
          <>
        <form onSubmit={handleLookup} className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <input
              ref={eanRef}
              value={eanInput}
              onChange={(event) => {
                setEanInput(event.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setSuggestOpen(false)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSuggestOpen(false);
              }}
              placeholder="Scan EAN, or search by name / brand / style code"
              autoComplete="off"
              className="h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 font-mono text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
            />
            <PosSearchSuggestions
              query={eanInput}
              open={suggestOpen}
              editingOrder={editingOrder}
              onPick={handlePick}
            />
          </div>
          <button
            type="submit"
            disabled={lookingUp || !eanInput.trim()}
            className="rounded-lg bg-emerald-600 px-4 text-xs font-black tracking-wider text-white hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500"
          >
            {lookingUp ? '…' : 'ADD'}
          </button>
          <button
            type="button"
            disabled={ticket.length === 0}
            onClick={() => {
              replaceTicket([]);
              tender.reset();
              setLookupError(null);
              setStatus(null);
              eanRef.current?.focus();
            }}
            className="rounded-lg border border-rose-500/40 px-4 text-xs font-black tracking-wider text-rose-300 hover:bg-rose-500/10 disabled:border-slate-700 disabled:text-slate-600"
          >
            CLEAR ALL
          </button>
        </form>
        {lookupError ? (
          <p className="mb-3 text-xs font-sans text-rose-400">{lookupError}</p>
        ) : null}
        {editingOrder ? (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <p className="font-sans text-xs text-amber-200">
              Editing bill {shortOrderId(editingOrder.id)} — scan, qty, discount and pay the same as a new sale. Save updates this bill.
            </p>
            <button
              type="button"
              onClick={cancelEdit}
              className="shrink-0 rounded-md border border-amber-500/50 px-2 py-1 text-[11px] font-black tracking-wider text-amber-100 hover:bg-amber-500/20"
            >
              CANCEL EDIT
            </button>
          </div>
        ) : null}
        {exchangingOrder ? (
          <div className="mb-4 space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-sans text-xs text-emerald-100">
                Exchange of bill {shortOrderId(exchangingOrder.id)} · within {EXCHANGE_WINDOW_DAYS} days · no cash refund — new items must cover the credit.
              </p>
              <button
                type="button"
                onClick={cancelEdit}
                className="shrink-0 rounded-md border border-emerald-500/50 px-2 py-1 text-[11px] font-black tracking-wider text-emerald-100 hover:bg-emerald-500/20"
              >
                CANCEL EXCHANGE
              </button>
            </div>
            <div className="overflow-x-auto rounded-md border border-emerald-500/20 bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="px-2 py-1.5 font-medium">Coming back</th>
                    <th className="px-2 py-1.5 font-medium">Size</th>
                    <th className="px-2 py-1.5 text-right font-medium">Paid</th>
                    <th className="px-2 py-1.5 text-right font-medium">Left</th>
                    <th className="px-2 py-1.5 text-right font-medium">Return qty</th>
                  </tr>
                </thead>
                <tbody>
                  {exchangeAvailability
                    .filter((row) => row.available > 0)
                    .map((row) => {
                      const line = exchangingOrder.items.find((item) => item.variant_id === row.variant_id);
                      const qty = exchangeReturns[row.variant_id] ?? 0;
                      return (
                        <tr key={row.variant_id} className="border-b border-slate-800">
                          <td className="px-2 py-1.5 font-sans text-slate-200">
                            {line?.product_name || 'Item'}
                            {line?.brand ? <span className="text-slate-500"> · {line.brand}</span> : null}
                          </td>
                          <td className="px-2 py-1.5 text-slate-300">{line?.size || '—'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                            {formatInr(row.price_at_purchase)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{row.available}</td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              max={row.available}
                              value={qty}
                              onChange={(event) => {
                                const next = Math.max(0, Math.min(row.available, Math.floor(Number(event.target.value) || 0)));
                                setExchangeReturns((current) => ({ ...current, [row.variant_id]: next }));
                              }}
                              className="h-8 w-16 rounded border border-slate-600 bg-slate-900 px-2 text-right text-white outline-none focus:border-emerald-400"
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <p className="font-sans text-[11px] text-emerald-200/80">
              Credit so far {formatInr(credit)} · scan the new items below.
            </p>
          </div>
        ) : null}

        {/* INVOICE ENTRY TABLE */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-sm">
                <th className="py-2">FASHION ITEM / GARMENT SKU</th>
                <th>SIZE</th>
                <th>COLOR</th>
                <th>MRP</th>
                <th>COST</th>
                <th>QTY</th>
                <th>DISC %</th>
                <th className="text-right">LINE TOTAL</th>
                <th className="text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {ticket.map((item) => (
                <tr key={item.variant.id} className="border-b border-slate-700/40 hover:bg-slate-700/20">
                  <td className="py-4 font-semibold text-slate-200">
                    <p>{item.product.name}</p>
                    <p className="font-mono text-[11px] font-normal text-slate-500">
                      {item.variant.barcode}
                    </p>
                  </td>
                  <td><span className="bg-slate-700 px-2 py-1 rounded text-xs font-bold">{item.variant.size}</span></td>
                  <td className="text-slate-300">{item.variant.color}</td>
                  <td>₹{item.product.base_price}</td>
                  <td className="text-slate-400">
                    {item.product.cost_price != null ? `₹${item.product.cost_price}` : "—"}
                  </td>
                  <td className="font-bold text-slate-200">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => decrementItem(item.variant.id)}
                        className="h-6 w-6 rounded bg-slate-700 text-xs hover:bg-slate-600"
                      >
                        −
                      </button>
                      <span>× {item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => incrementItem(item.variant.id)}
                        className="h-6 w-6 rounded bg-slate-700 text-xs hover:bg-slate-600"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={lineDiscountLimit(
                          item.variant.id,
                          item.product.base_price,
                          item.product.cost_price
                        )}
                        title={`Highest discount allowed on this item: ${lineDiscountLimit(
                          item.variant.id,
                          item.product.base_price,
                          item.product.cost_price
                        )}%`}
                        step={1}
                        value={item.discountPercent ?? 0}
                        onChange={(event) =>
                          setLineDiscount(
                            item.variant.id,
                            Math.min(
                              parseFloat(event.target.value) || 0,
                              lineDiscountLimit(
                                item.variant.id,
                                item.product.base_price,
                                item.product.cost_price
                              )
                            )
                          )
                        }
                        className="h-8 w-14 rounded border border-slate-600 bg-slate-900 px-1.5 text-center text-sm text-white outline-none focus:border-emerald-400"
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                    {lineDiscountLimit(
                      item.variant.id,
                      item.product.base_price,
                      item.product.cost_price
                    ) < maxDiscount ? (
                      <p className="mt-0.5 font-sans text-[10px] text-amber-400">
                        max{' '}
                        {lineDiscountLimit(
                          item.variant.id,
                          item.product.base_price,
                          item.product.cost_price
                        )}
                        % (margin)
                      </p>
                    ) : null}
                  </td>
                  <td className="text-right font-extrabold text-emerald-300">
                    ₹{posLineTotal(
                      item.product.base_price,
                      item.quantity,
                      item.discountPercent ?? 0
                    )}
                  </td>
                  <td className="text-center">
                    <button 
                      onClick={() => removeItemFromTicket(item.variant.id)}
                      className="text-rose-400 hover:text-rose-600 transition font-sans text-lg font-bold"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {ticket.length === 0 && (
            <div className="text-center text-slate-500 mt-32 space-y-2">
              <div className="text-lg font-bold animate-pulse">[ TYPE OR SCAN EAN ]</div>
              <div className="text-xs font-sans text-slate-600 max-w-sm mx-auto">
                Paste the EAN and press Enter, or use a USB scanner — it types the same code into this box.
              </div>
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {/* RIGHT WINDOW: PAYMENT TRANSACTION SUMMARY */}
      <div className={`flex w-96 flex-col justify-between rounded-xl border border-slate-700 bg-slate-800 p-6 print:hidden ${deskView !== "sale" ? "hidden" : ""}`}>
        <div className="min-h-0 overflow-y-auto pr-1">
          <h3 className="text-md font-bold text-slate-400 border-b border-slate-700 pb-2 uppercase tracking-wide">
            Checkout Panel
          </h3>
          
          <div className="mt-6 space-y-6">
            <div>
              <label htmlFor="attended-by" className="text-xs text-slate-400 tracking-wider">
                ATTENDED BY
              </label>
              <select
                id="attended-by"
                value={salesPersonId}
                onChange={(event) => setPickedSalesPersonId(event.target.value)}
                disabled={selectableSalesPeople.length === 0}
                className="mt-2 h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 font-sans text-sm text-white outline-none scheme-dark focus:border-emerald-400 disabled:text-slate-500"
              >
                <option value="">
                  {activeSalesPeople.length > 0 ? 'Select salesperson…' : 'No salespeople added yet'}
                </option>
                {selectableSalesPeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {person.active ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
              {activeSalesPeople.length === 0 && isAdmin ? (
                <Link
                  href="/admin/sales-team"
                  className="mt-1.5 inline-block font-sans text-[11px] text-emerald-300 hover:underline"
                >
                  Add your sales team in the admin panel
                </Link>
              ) : null}
            </div>
            <div>
              <label className="text-xs text-slate-400 tracking-wider">SELECT PAYMENT INSTRUMENT</label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                <button 
                  onClick={() => setPaymentMode('CASH')}
                  className={`w-full py-3 rounded-lg font-bold border transition duration-200 ${
                    paymentMode === 'CASH' 
                      ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-900/30' 
                      : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  💵 CASH DESK
                </button>
                <p className="mt-1.5 text-center font-sans text-xs text-slate-400">
                  In counter{' '}
                  <span
                    title={drawerError ?? undefined}
                    className={`font-black ${
                      drawerError ? 'text-amber-300' : drawerTotal != null && drawerTotal < 0 ? 'text-rose-300' : 'text-emerald-300'
                    }`}
                  >
                    {drawerError ? 'unavailable' : drawerTotal == null ? '…' : formatInr(drawerTotal)}
                  </span>
                </p>
                </div>
                <button 
                  onClick={() => setPaymentMode('UPI')}
                  className={`py-3 rounded-lg font-bold border transition duration-200 ${
                    paymentMode === 'UPI' 
                      ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-900/30' 
                      : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  📱 UPI QR
                </button>
              </div>
            </div>

            {paymentMode === 'CASH' ? (
              needsCashEntry ? (
                <CashTender due={cashDue} denominations={denominations} tender={tender} />
              ) : exchangingOrder && cashDue === 0 ? (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-sans text-xs text-emerald-200">
                  Even exchange — nothing to collect, the cash drawer stays as it is.
                </p>
              ) : (
                <p className="rounded-lg border border-slate-600 bg-slate-900/40 px-3 py-2 font-sans text-xs text-slate-400">
                  This bill was already paid in cash for ₹{cashDue}. Its cash record stays as it is. Change the
                  items or amount and you will be asked for the notes and coins again.
                </p>
              )
            ) : null}
          </div>
        </div>

        {/* FINANCIAL SUMMARY COUNTER */}
        <div className="border-t border-slate-700 pt-6">
          <div className="mb-6 space-y-2">
            {exchangingOrder ? (
              <div className="mb-3 space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 font-sans text-xs text-slate-300">
                <div className="flex justify-between"><span>New items</span><span className="tabular-nums">{formatInr(newTotal)}</span></div>
                <div className="flex justify-between"><span>Exchange credit</span><span className="tabular-nums">− {formatInr(credit)}</span></div>
                <div className="flex justify-between border-t border-emerald-500/20 pt-1 text-sm font-semibold text-emerald-300">
                  <span>Customer pays</span>
                  <span className="tabular-nums">{formatInr(amountDue)}</span>
                </div>
                {amountDue <= 0 && credit > 0 && newTotal + 0.001 < credit ? (
                  <p className="pt-1 text-amber-300">New items are short of the credit — add more or pick a higher MRP.</p>
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-sm font-sans">
                {exchangingOrder ? 'AMOUNT DUE:' : 'NET RUNNING TOTAL:'}
              </span>
              <span className="text-4xl font-black text-emerald-400">
                ₹{exchangingOrder ? amountDue : getGrandTotal()}
              </span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 font-sans">
              <span>COST (RATE)</span>
              <span>
                ₹
                {ticket.reduce(
                  (sum, item) => sum + Number(item.product.cost_price ?? 0) * item.quantity,
                  0
                )}
              </span>
            </div>
          </div>
          
          <div className="space-y-2">
            {status && (
              <p className="text-xs text-center text-emerald-300 font-sans">{status}</p>
            )}
            <button
              type="button"
              disabled={ticket.length === 0}
              onClick={handlePreviewBill}
              className="w-full rounded-lg border border-slate-500 py-3 text-sm font-black tracking-wider text-slate-200 hover:bg-slate-700 disabled:border-slate-700 disabled:text-slate-500"
            >
              PREVIEW BILL
            </button>
            <button 
              disabled={
                ticket.length === 0 ||
                submitting ||
                (Boolean(exchangingOrder) && (returnLines.length === 0 || newTotal + 0.001 < credit))
              }
              onClick={handleCloseInvoice}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-black py-4 rounded-lg text-lg tracking-wider transition transform active:scale-95 shadow-md"
            >
              {submitting
                ? exchangingOrder
                  ? 'POSTING EXCHANGE...'
                  : editingOrder
                    ? 'SAVING BILL...'
                    : 'POSTING INVOICE...'
                : exchangingOrder
                  ? 'COMPLETE EXCHANGE & PRINT'
                  : editingOrder
                    ? 'SAVE & PRINT INVOICE'
                    : 'CLOSE & PRINT INVOICE'}
            </button>
          </div>
        </div>

      </div>

      {receipt ? (
        <PosReceiptPreview
          receipt={receipt}
          posted={receiptPosted}
          onClose={() => setReceipt(null)}
        />
      ) : null}
    </div>
  );
}
