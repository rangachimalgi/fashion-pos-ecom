import { STORE_RECEIPT } from "@/lib/storeReceipt";
import type { PosReceipt } from "@/lib/posReceipt";

function inr(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TaxInvoiceReceipt({ receipt }: { receipt: PosReceipt }) {
  return (
    <div className="pos-receipt mx-auto w-[80mm] overflow-hidden bg-white text-[12px] font-black leading-snug text-black font-[Arial,Helvetica,sans-serif]">
      <div className="bg-black px-2 py-2 text-center text-white">
        <p className="text-[11px] font-bold tracking-wide">{STORE_RECEIPT.name}</p>
        <p className="text-lg font-black tracking-wide">{STORE_RECEIPT.nameLine2}</p>
        <p className="mt-1 text-[10px] font-semibold leading-snug text-white">
          {STORE_RECEIPT.addressLines.join(" · ")}
        </p>
        <p className="mt-0.5 text-[10px] font-semibold text-white">
          GSTIN {STORE_RECEIPT.gstin}
        </p>
        <p className="text-[10px] font-semibold text-white">Ph {STORE_RECEIPT.phone}</p>
        <p className="mt-1.5 text-[11px] font-black tracking-widest text-white">TAX INVOICE</p>
      </div>

      <div className="grid grid-cols-3 border-b-2 border-black px-2 py-1.5 text-[11px] font-bold">
        <div>
          <p className="text-[9px] font-bold uppercase">Bill</p>
          <p>{receipt.billNo}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] font-bold uppercase">Date</p>
          <p>{receipt.dateLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold uppercase">Time</p>
          <p>{receipt.timeLabel}</p>
        </div>
      </div>

      <div className="px-2">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 border-b-2 border-black py-1 text-[10px] font-black uppercase">
          <span>Item</span>
          <span className="w-7 text-right">Qty</span>
          <span className="w-16 text-right">Value</span>
        </div>

        {receipt.lines.map((line) => (
          <div key={`${line.sl}-${line.code}`} className="border-b border-black py-1.5">
            <div className="grid grid-cols-[1fr_auto_auto] items-start gap-x-2">
              <div className="min-w-0">
                <p className="text-[12px] font-bold uppercase">
                  {line.sl}. {line.desc}
                </p>
                <p className="text-[10px] font-bold">{line.code}</p>
              </div>
              <p className="w-7 text-right font-bold">{line.qty}</p>
              <div className="w-16 text-right">
                <p className="font-black">{inr(line.value)}</p>
                <p className="text-[10px] font-bold">{inr(line.rate)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-2 py-2 text-[14px] font-black leading-none">
        <p className="flex justify-between py-0.5">
          <span>TOTAL · {receipt.itemCount} PCS</span>
          <span>Rs {inr(receipt.total)}</span>
        </p>
        <p className="flex justify-between py-0.5">
          <span>DISCOUNT</span>
          <span>Rs {inr(receipt.discount)}</span>
        </p>
        <p className="mt-1 flex items-center justify-between border-t-2 border-black pt-1.5 text-[15px]">
          <span>NET AMOUNT</span>
          <span>Rs {inr(receipt.netAmount)}</span>
        </p>
      </div>

      <div className="flex justify-between px-2 text-[11px] font-bold">
        <span>Attended: {receipt.attendedBy || "—"}</span>
        <span>Pay: {receipt.payment}</span>
      </div>

      <div className="mt-1 px-2 text-[11px] font-bold">
        <p className="flex justify-between">
          <span>
            CGST @{STORE_RECEIPT.cgstRate.toFixed(2)}% on {inr(receipt.taxable)}
          </span>
          <span>Rs {inr(receipt.cgst)}</span>
        </p>
        <p className="flex justify-between">
          <span>
            SGST @{STORE_RECEIPT.sgstRate.toFixed(2)}% on {inr(receipt.taxable)}
          </span>
          <span>Rs {inr(receipt.sgst)}</span>
        </p>
      </div>

      <div className="mt-1.5 border-t-2 border-black px-2 py-1.5">
        <p className="text-[10px] font-black uppercase">Terms</p>
        <ul className="mt-0.5 text-[10px] font-bold leading-snug">
          {STORE_RECEIPT.terms.map((term) => (
            <li key={term}>* {term}</li>
          ))}
        </ul>
        <p className="mt-1.5 text-center text-[11px] font-black">
          {STORE_RECEIPT.footer}
        </p>
      </div>
    </div>
  );
}
