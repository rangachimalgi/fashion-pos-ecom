"use client";

import { TaxInvoiceReceipt } from "@/components/pos/TaxInvoiceReceipt";
import type { PosReceipt } from "@/lib/posReceipt";

export function PosReceiptPreview({
  receipt,
  posted,
  onClose,
}: {
  receipt: PosReceipt;
  posted: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/80 p-6 backdrop-blur-sm print:static print:inset-auto print:overflow-visible print:bg-white print:p-0 print:backdrop-blur-none">
      <div className="mx-auto flex min-h-full max-w-[420px] flex-col items-stretch print:max-w-none print:min-h-0">
        <div className="no-print mb-3 flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
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
          <TaxInvoiceReceipt receipt={receipt} />
        </div>
      </div>
    </div>
  );
}
