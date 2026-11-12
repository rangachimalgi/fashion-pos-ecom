import { STORE_RECEIPT } from "@/lib/storeReceipt";
import type { PosReceipt } from "@/lib/posReceipt";

function inr(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SERIF = "font-[Georgia,'Times_New_Roman',serif]";

/** Tiny spaced-out caption, used for labels. */
function Caption({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[8px] leading-none tracking-[0.18em] uppercase ${className}`}>{children}</p>;
}

/**
 * 80mm thermal receipt (prints about 72mm wide). Black on white only, regular weight for
 * almost everything, bold reserved for the amount to pay, hairline rules instead of fills.
 */
export function TaxInvoiceReceipt({ receipt }: { receipt: PosReceipt }) {
  return (
    <div className="pos-receipt mx-auto w-[72mm] overflow-hidden bg-white px-[3mm] pt-[3mm] pb-[3.5mm] font-[Arial,Helvetica,sans-serif] text-[11px] leading-[1.35] text-black">
      {/* ---------- Letterhead ---------- */}
      <header className="text-center">
        <p className="text-[9.5px] tracking-[0.3em] uppercase">{STORE_RECEIPT.name}</p>
        <p className={`mt-1 ${SERIF} text-[24px] leading-none tracking-[0.34em] pl-[0.34em]`}>
          {STORE_RECEIPT.nameLine2}
        </p>
        <div className="mx-auto mt-2 flex items-center gap-1.5">
          <span className="h-px flex-1 bg-black" />
          <span className="size-0.75 rotate-45 bg-black" />
          <span className="h-px flex-1 bg-black" />
        </div>
        <p className="mt-2 text-[9px] leading-[1.45]">
          {STORE_RECEIPT.addressLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
        <p className="mt-1 text-[9px] tracking-wide">
          GSTIN {STORE_RECEIPT.gstin} <span className="mx-0.5">·</span> Ph {STORE_RECEIPT.phone}
        </p>
        <p className="mt-2.5 inline-block border border-black px-3 py-0.75 text-[9px] tracking-[0.35em] pl-[calc(0.75rem+0.35em)] uppercase">
          Tax Invoice
        </p>
      </header>

      {/* ---------- Bill meta ---------- */}
      <div className="mt-3 grid grid-cols-3 border-y border-black py-1.5">
        <div>
          <Caption>Bill no.</Caption>
          <p className="mt-1 text-[10.5px]">{receipt.billNo}</p>
        </div>
        <div className="text-center">
          <Caption>Date</Caption>
          <p className="mt-1 text-[10.5px]">{receipt.dateLabel}</p>
        </div>
        <div className="text-right">
          <Caption>Time</Caption>
          <p className="mt-1 text-[10.5px]">{receipt.timeLabel}</p>
        </div>
      </div>

      {/* ---------- Items ---------- */}
      <div className="mt-2">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 pb-1">
          <Caption>Item</Caption>
          <Caption className="w-7 text-right">Qty</Caption>
          <Caption className="w-[17mm] text-right">Amount</Caption>
        </div>

        <div className="border-t border-black">
          {receipt.lines.map((line, index) => (
            <div
              key={`${line.sl}-${line.code}`}
              className={`grid grid-cols-[1fr_auto_auto] items-start gap-x-2 py-1.5 ${
                index > 0 ? "border-t border-dotted border-black/70" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="text-[10.5px] leading-[1.3] tracking-[0.03em] uppercase">{line.desc}</p>
                <p className="mt-0.5 text-[8.5px] tracking-[0.08em]">
                  {line.code}
                  {line.discountPercent > 0 ? ` · ${line.discountPercent}% off` : ""}
                </p>
              </div>
              <p className="w-7 pt-px text-right tabular-nums">{line.qty}</p>
              <div className="w-[17mm] text-right">
                <p className="tabular-nums">{inr(line.value)}</p>
                {line.discountPercent > 0 ? (
                  <p className="mt-0.5 text-[8.5px] tabular-nums line-through">{inr(line.rate * line.qty)}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- Totals ---------- */}
      <div className="border-t border-black pt-1.5">
        <p className="flex justify-between py-px">
          <span>Subtotal · {receipt.itemCount} {receipt.itemCount === 1 ? "piece" : "pieces"}</span>
          <span className="tabular-nums">{inr(receipt.total)}</span>
        </p>
        <p className="flex justify-between py-px">
          <span>Discount</span>
          <span className="tabular-nums">{receipt.discount > 0 ? `− ${inr(receipt.discount)}` : inr(0)}</span>
        </p>
      </div>

      <div className="mt-2 border-y border-black py-0.75">
        <div className="flex items-baseline justify-between border-y border-black px-0 py-2">
          <span className="text-[9px] tracking-[0.3em] uppercase">Net amount</span>
          <span className="text-[17px] leading-none font-bold tabular-nums">
            <span className="mr-1 text-[10px] font-normal">Rs</span>
            {inr(receipt.netAmount)}
          </span>
        </div>
      </div>

      <p className="mt-1.5 flex justify-between text-[9.5px]">
        <span>Attended by {receipt.attendedBy || "—"}</span>
        <span>Paid by {receipt.payment}</span>
      </p>

      {/* ---------- Tax ---------- */}
      <div className="mt-2 text-[9px] leading-normal">
        <Caption className="mb-1">Tax included</Caption>
        <p className="flex justify-between">
          <span>
            CGST {STORE_RECEIPT.cgstRate.toFixed(1)}% on {inr(receipt.taxable)}
          </span>
          <span className="tabular-nums">{inr(receipt.cgst)}</span>
        </p>
        <p className="flex justify-between">
          <span>
            SGST {STORE_RECEIPT.sgstRate.toFixed(1)}% on {inr(receipt.taxable)}
          </span>
          <span className="tabular-nums">{inr(receipt.sgst)}</span>
        </p>
      </div>

      {/* ---------- Terms & thanks ---------- */}
      <div className="mt-3 border-t border-dotted border-black pt-2">
        <Caption className="mb-1">Terms</Caption>
        <ul className="text-[8.5px] leading-normal">
          {STORE_RECEIPT.terms.map((term) => (
            <li key={term} className="flex gap-1.5">
              <span aria-hidden>·</span>
              <span>{term}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="mt-3 text-center">
        <div className="mx-auto mb-2 flex items-center justify-center gap-1.5">
          <span className="h-px w-8 bg-black" />
          <span className="size-0.75 rotate-45 bg-black" />
          <span className="h-px w-8 bg-black" />
        </div>
        <p className={`${SERIF} text-[12px] italic tracking-wide`}>
          {STORE_RECEIPT.footer.charAt(0) + STORE_RECEIPT.footer.slice(1).toLowerCase()}
        </p>
      </footer>
    </div>
  );
}
