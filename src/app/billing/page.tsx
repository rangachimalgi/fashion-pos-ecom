"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { useCartStore } from '@/store/useCartStore';

export default function BillingTerminal() {
  const { cart, removeItemFromCart, getGrandTotal, clearCart } = useCartStore();
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI'>('CASH');

  return (
    <div className="flex h-screen bg-slate-900 text-white font-mono p-6 gap-6">
      
      {/* LEFT WINDOW: CURRENT ACTIVE BILLING TRANSACTION */}
      <div className="flex-1 bg-slate-800 rounded-xl p-6 flex flex-col border border-slate-700">
        <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
          <h2 className="text-xl font-extrabold text-emerald-400 tracking-wider">🛒 COUNTER POS DESK</h2>
          <div className="flex items-center gap-3">
            <Link
              href="/billing/add-product"
              className="bg-slate-700 hover:bg-slate-600 text-emerald-300 border border-slate-600 px-3 py-1 rounded text-xs font-bold transition"
            >
              + Add New Product
            </Link>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded text-xs animate-pulse">
              ● SYSTEM ONLINE & CONNECTED
            </span>
          </div>
        </div>

        {/* INVOICE ENTRY TABLE */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-sm">
                <th className="py-2">FASHION ITEM / GARMENT SKU</th>
                <th>SIZE</th>
                <th>COLOR</th>
                <th>UNIT PRICE</th>
                <th>QTY</th>
                <th className="text-right">LINE TOTAL</th>
                <th className="text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.variant.id} className="border-b border-slate-700/40 hover:bg-slate-700/20">
                  <td className="py-4 font-semibold text-slate-200">{item.product.name}</td>
                  <td><span className="bg-slate-700 px-2 py-1 rounded text-xs font-bold">{item.variant.size}</span></td>
                  <td className="text-slate-300">{item.variant.color}</td>
                  <td>₹{item.product.base_price}</td>
                  <td className="font-bold text-slate-200">× {item.quantity}</td>
                  <td className="text-right font-extrabold text-emerald-300">₹{item.product.base_price * item.quantity}</td>
                  <td className="text-center">
                    <button 
                      onClick={() => removeItemFromCart(item.variant.id)}
                      className="text-rose-400 hover:text-rose-600 transition font-sans text-lg font-bold"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {cart.length === 0 && (
            <div className="text-center text-slate-500 mt-32 space-y-2">
              <div className="text-lg font-bold animate-pulse">[ SCANNER READY ]</div>
              <div className="text-xs font-sans text-slate-600 max-w-sm mx-auto">
                Trigger your physical USB barcode gun at a clothing tag or add test items to populate the bill matrix.
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
          <div className="flex justify-between items-baseline mb-6">
            <span className="text-slate-400 text-sm font-sans">NET RUNNING TOTAL:</span>
            <span className="text-4xl font-black text-emerald-400">₹{getGrandTotal()}</span>
          </div>
          
          <div className="space-y-2">
            <button 
              disabled={cart.length === 0}
              onClick={() => {
                alert(`Invoice Processed successfully via ${paymentMode}!`);
                clearCart();
              }}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-black py-4 rounded-lg text-lg tracking-wider transition transform active:scale-95 shadow-md"
            >
              CLOSE & PRINT INVOICE
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
