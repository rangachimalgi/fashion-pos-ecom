import { STORE_RECEIPT } from "@/lib/storeReceipt";
import type { PosReceipt } from "@/lib/posReceipt";

function inr(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TaxInvoiceReceipt({ receipt }: { receipt: PosReceipt }) {
  return (
    <div className="pos-receipt mx-auto w-[80mm] overflow-hidden bg-white font-sans text-[10px] leading-tight text-neutral-800">
      <div className="bg-[#1a1510] px-2.5 py-2.5 text-center text-white">
        <p className="text-[8px] font-medium tracking-[0.22em] text-[#d4a574]">
          {STORE_RECEIPT.name}
        </p>
        <p className="text-base font-semibold tracking-[0.16em]">{STORE_RECEIPT.nameLine2}</p>
        <p className="mt-1 text-[8px] leading-snug text-neutral-300">
          {STORE_RECEIPT.addressLines.join(" · ")}
        </p>
        <p className="mt-0.5 text-[8px] text-neutral-400">
          GSTIN {STORE_RECEIPT.gstin} · Ph {STORE_RECEIPT.phone}
        </p>
        <p className="mt-1.5 text-[8px] font-semibold tracking-[0.2em] text-[#d4a574]">
          TAX INVOICE
        </p>
      </div>

      <div className="grid grid-cols-3 px-2.5 py-1.5 text-[9px]">
        <div>
          <p className="text-[7px] uppercase tracking-wider text-neutral-400">Bill</p>
          <p className="font-medium text-neutral-900">{receipt.billNo}</p>
        </div>
        <div className="text-center">
          <p className="text-[7px] uppercase tracking-wider text-neutral-400">Date</p>
          <p className="font-medium text-neutral-900">{receipt.dateLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[7px] uppercase tracking-wider text-neutral-400">Time</p>
          <p className="font-medium text-neutral-900">{receipt.timeLabel}</p>
        </div>
      </div>

      <div className="px-2.5">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 border-y border-neutral-200 py-1 text-[7px] font-medium uppercase tracking-wider text-neutral-400">
          <span>Item</span>
          <span className="w-6 text-right">Qty</span>
          <span className="w-14 text-right">Value</span>
        </div>

        {receipt.lines.map((line) => (
          <div key={`${line.sl}-${line.code}`} className="border-b border-neutral-100 py-1">
            <div className="grid grid-cols-[1fr_auto_auto] items-start gap-x-2">
              <div className="min-w-0">
                <p className="text-[10px] font-medium capitalize text-neutral-900">
                  {line.sl}. {line.desc}
                </p>
                <p className="font-mono text-[8px] text-neutral-500">{line.code}</p>
              </div>
              <p className="w-6 text-right text-neutral-700">{line.qty}</p>
              <div className="w-14 text-right">
                <p className="font-medium text-neutral-900">{inr(line.value)}</p>
                <p className="text-[8px] text-neutral-400">{inr(line.rate)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-2.5 py-1.5">
        <p className="flex justify-between text-neutral-500">
          <span>Total · {receipt.itemCount} pcs</span>
          <span>₹ {inr(receipt.total)}</span>
        </p>
        <p className="mt-0.5 flex justify-between text-neutral-500">
          <span>Discount</span>
          <span>₹ {inr(receipt.discount)}</span>
        </p>
        <p className="mt-1 flex items-end justify-between border-t border-neutral-200 pt-1">
          <span className="text-[8px] font-semibold uppercase tracking-wider text-neutral-500">
            Net amount
          </span>
          <span className="text-sm font-semibold text-neutral-900">₹ {inr(receipt.netAmount)}</span>
        </p>
      </div>

      <div className="flex justify-between px-2.5 text-[9px] text-neutral-600">
        <span>Attended: {receipt.attendedBy || "—"}</span>
        <span>Pay: {receipt.payment}</span>
      </div>

      <div className="mt-1 px-2.5 text-[9px] text-neutral-600">
        <p className="flex justify-between">
          <span>
            CGST @{STORE_RECEIPT.cgstRate.toFixed(2)}% on {inr(receipt.taxable)}
          </span>
          <span>₹ {inr(receipt.cgst)}</span>
        </p>
        <p className="flex justify-between">
          <span>
            SGST @{STORE_RECEIPT.sgstRate.toFixed(2)}% on {inr(receipt.taxable)}
          </span>
          <span>₹ {inr(receipt.sgst)}</span>
        </p>
      </div>

      <div className="mt-1.5 border-t border-neutral-200 px-2.5 py-1.5">
        <p className="text-[7px] font-semibold uppercase tracking-wider text-neutral-400">Terms</p>
        <ul className="mt-0.5 space-y-0 text-[7px] leading-snug text-neutral-500">
          {STORE_RECEIPT.terms.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ul>
        <p className="mt-1.5 text-center text-[8px] font-medium tracking-wide text-[#b8874c]">
          {STORE_RECEIPT.footer}
        </p>
      </div>
    </div>
  );
}
