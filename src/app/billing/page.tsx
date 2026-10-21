"use client";
import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePosTicketStore } from '@/store/usePosTicketStore';
import { supabase } from '@/lib/supabaseClient';
import { placeOrder } from '@/lib/placeOrder';
import { lookupPosByEan } from '@/lib/posLookup';
import { getStaffProfile, signOutStaff } from '@/lib/staffAuth';
import type { PaymentMethod } from '@/types/order';
import { useRouter } from 'next/navigation';

export default function BillingTerminal() {
  const router = useRouter();
  const {
    ticket,
    addItemToTicket,
    incrementItem,
    decrementItem,
    removeItemFromTicket,
    getGrandTotal,
    clearTicket,
    patchTicketProduct,
  } = usePosTicketStore();
  const [paymentMode, setPaymentMode] = useState<PaymentMethod>('CASH');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [eanInput, setEanInput] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const eanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStaffProfile()
      .then((profile) => setIsAdmin(profile?.role === 'admin'))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    eanRef.current?.focus();
  }, [ticket.length]);

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
        setLookupError(`No product for EAN ${code}`);
        return;
      }
      if (hit.variant.stock_quantity <= 0) {
        setLookupError(
          `${hit.product.name} · ${hit.variant.size} is out of stock (MRP ₹${hit.product.base_price})`
        );
        return;
      }

      const already = ticket.find((item) => item.variant.id === hit.variant.id);
      if (already && already.quantity >= hit.variant.stock_quantity) {
        setLookupError(`Only ${hit.variant.stock_quantity} in stock for that EAN`);
        return;
      }

      addItemToTicket(
        {
          ...hit.product,
          cost_price:
            hit.product.cost_price == null
              ? null
              : Number(hit.product.cost_price),
        },
        hit.variant
      );
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

  const handleCloseInvoice = async () => {
    if (ticket.length === 0 || submitting) return;

    setSubmitting(true);
    setStatus(null);

    try {
      const payload = await placeOrder(supabase, {
        payment_method: paymentMode,
        source: 'POS',
        items: ticket.map((item) => ({
          variant_id: item.variant.id,
          quantity: item.quantity,
        })),
      });

      clearTicket();
      setStatus(`Invoice ${payload.order_id} posted via ${paymentMode}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-white font-mono p-6 gap-6">
      
      {/* LEFT WINDOW: CURRENT ACTIVE BILLING TRANSACTION */}
      <div className="flex-1 bg-slate-800 rounded-xl p-6 flex flex-col border border-slate-700">
        <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
          <h2 className="text-xl font-extrabold text-emerald-400 tracking-wider">🛒 COUNTER POS DESK</h2>
          <div className="flex items-center gap-3">
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
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded text-xs animate-pulse">
              ● SYSTEM ONLINE & CONNECTED
            </span>
          </div>
        </div>

        <form onSubmit={handleLookup} className="mb-4 flex gap-2">
          <input
            ref={eanRef}
            value={eanInput}
            onChange={(event) => setEanInput(event.target.value)}
            placeholder="Type or scan EAN, then Enter"
            autoComplete="off"
            className="h-11 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 font-mono text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
          />
          <button
            type="submit"
            disabled={lookingUp || !eanInput.trim()}
            className="rounded-lg bg-emerald-600 px-4 text-xs font-black tracking-wider text-white hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500"
          >
            {lookingUp ? '…' : 'ADD'}
          </button>
        </form>
        {lookupError ? (
          <p className="mb-3 text-xs font-sans text-rose-400">{lookupError}</p>
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
                  <td className="text-right font-extrabold text-emerald-300">₹{item.product.base_price * item.quantity}</td>
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
      </div>

      {/* RIGHT WINDOW: PAYMENT TRANSACTION SUMMARY */}
      <div className="w-96 bg-slate-800 rounded-xl p-6 flex flex-col justify-between border border-slate-700">
        <div>
          <h3 className="text-md font-bold text-slate-400 border-b border-slate-700 pb-2 uppercase tracking-wide">
            Checkout Panel
          </h3>
          
          <div className="mt-6 space-y-6">
            <div>
              <label className="text-xs text-slate-400 tracking-wider">SELECT PAYMENT INSTRUMENT</label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button 
                  onClick={() => setPaymentMode('CASH')}
                  className={`py-3 rounded-lg font-bold border transition duration-200 ${
                    paymentMode === 'CASH' 
                      ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-900/30' 
                      : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  💵 CASH DESK
                </button>
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
          </div>
        </div>

        {/* FINANCIAL SUMMARY COUNTER */}
        <div className="border-t border-slate-700 pt-6">
          <div className="mb-6 space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-sm font-sans">NET RUNNING TOTAL:</span>
              <span className="text-4xl font-black text-emerald-400">₹{getGrandTotal()}</span>
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
              disabled={ticket.length === 0 || submitting}
              onClick={handleCloseInvoice}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-black py-4 rounded-lg text-lg tracking-wider transition transform active:scale-95 shadow-md"
            >
              {submitting ? 'POSTING INVOICE...' : 'CLOSE & PRINT INVOICE'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
