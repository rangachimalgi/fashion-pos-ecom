import { STORE_RECEIPT } from "@/lib/storeReceipt";
import type { PosReceipt } from "@/lib/posReceipt";

function inr(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TaxInvoiceReceipt({ receipt }: { receipt: PosReceipt }) {
  return (
    <div className="pos-receipt mx-auto w-full overflow-hidden bg-white font-sans text-[11px] leading-snug text-neutral-800 print:text-[12px]">
      <div className="bg-[#1a1510] px-5 pb-5 pt-6 text-center text-white print:px-6 print:pb-6 print:pt-7">
        <p className="text-[10px] font-medium tracking-[0.32em] text-[#d4a574] print:text-xs">
          {STORE_RECEIPT.name}
        </p>
        <p className="mt-1 text-2xl font-semibold tracking-[0.2em] print:text-3xl">
          {STORE_RECEIPT.nameLine2}
        </p>
        <div className="mx-auto mt-3 h-px w-12 bg-[#d4a574]/70" />
        <p className="mt-3 text-[10px] leading-relaxed text-neutral-300 print:text-xs">
          {STORE_RECEIPT.addressLines.join(" · ")}
        </p>
        <div className="mt-2 flex justify-center gap-2 text-[10px] tracking-wide text-neutral-400 print:text-xs">
          <span>GSTIN {STORE_RECEIPT.gstin}</span>
          <span className="text-[#d4a574]">·</span>
          <span>Ph {STORE_RECEIPT.phone}</span>
        </div>
        <p className="mt-4 inline-block rounded-full border border-[#d4a574]/40 px-4 py-1 text-[9px] font-semibold tracking-[0.22em] text-[#d4a574] print:text-[10px]">
          TAX INVOICE
        </p>
      </div>

      <div className="grid grid-cols-3 bg-neutral-100 px-5 py-3 text-[11px] print:px-6 print:py-4 print:text-sm">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-neutral-400">Bill</p>
          <p className="mt-0.5 font-medium text-neutral-900">{receipt.billNo}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-wider text-neutral-400">Date</p>
          <p className="mt-0.5 font-medium text-neutral-900">{receipt.dateLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-wider text-neutral-400">Time</p>
          <p className="mt-0.5 font-medium text-neutral-900">{receipt.timeLabel}</p>
        </div>
      </div>

      <div className="px-5 print:px-6">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-y border-neutral-200 py-2 text-[9px] font-medium uppercase tracking-wider text-neutral-400">
          <span>Item</span>
          <span className="w-10 text-right">Qty</span>
          <span className="w-20 text-right">Value</span>
        </div>

        {receipt.lines.map((line) => (
          <div
            key={`${line.sl}-${line.code}`}
            className="border-b border-neutral-100 py-3"
          >
            <div className="grid grid-cols-[1fr_auto_auto] items-start gap-x-4">
              <div className="min-w-0">
                <p className="text-sm font-medium capitalize text-neutral-900">
                  <span className="mr-1.5 text-[10px] text-neutral-400">{line.sl}.</span>
                  {line.desc}
                </p>
                <p className="mt-1 font-mono text-[10px] tracking-wide text-neutral-500">
                  {line.code}
                </p>
                <p className="mt-0.5 text-[10px] text-neutral-400">
                  CGST / SGST @{STORE_RECEIPT.cgstRate.toFixed(2)}% each
                </p>
              </div>
              <p className="w-10 pt-0.5 text-right text-sm text-neutral-700">{line.qty}</p>
              <div className="w-20 pt-0.5 text-right">
                <p className="text-sm font-medium text-neutral-900">{inr(line.value)}</p>
                <p className="text-[10px] text-neutral-400">{inr(line.rate)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-5 mt-5 rounded-2xl bg-neutral-50 px-4 py-4 print:mx-6">
        <p className="flex justify-between text-sm text-neutral-500">
          <span>Total · {receipt.itemCount} pcs</span>
          <span>₹ {inr(receipt.total)}</span>
        </p>
        <p className="mt-1.5 flex justify-between text-sm text-neutral-500">
          <span>Discount</span>
          <span>₹ {inr(receipt.discount)}</span>
        </p>
        <div className="mt-3 flex items-end justify-between border-t border-neutral-200 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Net amount
          </span>
          <span className="text-2xl font-semibold tracking-tight text-neutral-900">
            ₹ {inr(receipt.netAmount)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 px-5 text-[11px] print:px-6">
        <div className="rounded-xl border border-neutral-200 px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wider text-neutral-400">Attended by</p>
          <p className="mt-0.5 font-medium text-neutral-800">{receipt.attendedBy || "—"}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 px-3 py-2.5">
          <p className="text-[9px] uppercase tracking-wider text-neutral-400">Payment</p>
          <p className="mt-0.5 font-medium text-neutral-800">{receipt.payment}</p>
        </div>
      </div>

      <div className="mt-4 px-5 text-[11px] text-neutral-600 print:px-6 print:text-sm">
        <p className="flex justify-between">
          <span>
            CGST @{STORE_RECEIPT.cgstRate.toFixed(2)}% on {inr(receipt.taxable)}
          </span>
          <span>₹ {inr(receipt.cgst)}</span>
        </p>
        <p className="mt-1 flex justify-between">
          <span>
            SGST @{STORE_RECEIPT.sgstRate.toFixed(2)}% on {inr(receipt.taxable)}
          </span>
          <span>₹ {inr(receipt.sgst)}</span>
        </p>
      </div>

      <div className="mt-5 border-t border-neutral-200 px-5 py-5 print:px-6">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
          Terms
        </p>
        <ul className="mt-2 space-y-1 text-[10px] leading-relaxed text-neutral-500 print:text-[11px]">
          {STORE_RECEIPT.terms.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ul>
        <p className="mt-5 text-center text-[11px] font-medium tracking-[0.14em] text-[#b8874c]">
          {STORE_RECEIPT.footer}
        </p>
      </div>
    </div>
  );
}
