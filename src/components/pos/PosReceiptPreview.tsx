"use client";

import { useEffect, useState } from "react";
import { TaxInvoiceReceipt } from "@/components/pos/TaxInvoiceReceipt";
import type { PosReceipt } from "@/lib/posReceipt";
import { getReceiptTerms, DEFAULT_RECEIPT_TERMS } from "@/lib/receiptSettings";
import { supabase } from "@/lib/supabaseClient";

export function PosReceiptPreview({
  receipt,
  posted,
  onClose,
}: {
  receipt: PosReceipt;
  posted: boolean;
  onClose: () => void;
}) {
  const [terms, setTerms] = useState<string[]>(
    receipt.terms?.length ? receipt.terms : DEFAULT_RECEIPT_TERMS
  );

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-receipt-print", "true");
    style.textContent =
      "@media print { @page { size: 80mm auto; margin: 0; } }";
    document.head.appendChild(style);

    const done = () => {
      document.documentElement.classList.remove("print-receipt");
    };
    window.addEventListener("afterprint", done);
    return () => {
      style.remove();
      window.removeEventListener("afterprint", done);
      done();
    };
  }, []);

  useEffect(() => {
    if (receipt.terms && receipt.terms.length > 0) {
      setTerms(receipt.terms);
      return;
    }
    let cancelled = false;
    getReceiptTerms(supabase)
      .then((next) => {
        if (!cancelled) setTerms(next);
      })
      .catch(() => {
        if (!cancelled) setTerms(DEFAULT_RECEIPT_TERMS);
      });
    return () => {
      cancelled = true;
    };
  }, [receipt.terms]);

  const printReceipt = () => {
    const previousTitle = document.title;
    document.title = " ";
    document.documentElement.classList.add("print-receipt");
    window.print();
    document.title = previousTitle;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/80 p-6 backdrop-blur-sm print:static print:inset-auto print:overflow-visible print:bg-white print:p-0 print:backdrop-blur-none">
      <div className="mx-auto flex w-[72mm] flex-col items-stretch print:w-[72mm] print:min-h-0">
        <div className="no-print mb-3 flex gap-2 print:hidden">
          <button
            type="button"
            onClick={printReceipt}
            className="flex-1 rounded-full bg-[#d4a574] py-2 text-sm font-semibold text-neutral-950"
          >
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full bg-white/90 py-2 text-sm font-semibold text-neutral-900"
          >
            {posted ? "Done" : "Close"}
          </button>
        </div>
        {posted ? null : (
          <p className="no-print mb-2 text-center font-sans text-[11px] text-amber-200/90 print:hidden">
            Preview only — this bill is not posted yet
          </p>
        )}
        <div className="pos-print-root overflow-hidden rounded-2xl shadow-2xl print:rounded-none print:shadow-none">
          <TaxInvoiceReceipt receipt={{ ...receipt, terms }} />
        </div>
      </div>
    </div>
  );
}
