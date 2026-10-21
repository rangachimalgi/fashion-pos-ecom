import { STORE_TAG_BRAND } from "@/lib/storeTag";
import type { HangTag } from "@/lib/storeTag";
import { TagBarcode } from "@/components/admin/TagBarcode";

export function ProductHangTag({ tag }: { tag: HangTag }) {
  return (
    <div className="product-hang-tag box-border flex h-[38mm] w-[76mm] flex-col overflow-hidden border border-neutral-800 bg-white px-1.5 py-1 text-black">
      <p className="shrink-0 text-center text-[7px] font-semibold tracking-[0.22em]">
        {STORE_TAG_BRAND}
      </p>
      <div className="flex h-[8mm] shrink-0 items-center justify-center overflow-hidden">
        {tag.barcode ? <TagBarcode value={tag.barcode} /> : null}
      </div>
      <p className="mt-0.5 truncate text-[8px] font-bold uppercase leading-none tracking-wide">
        {tag.code} {tag.name}
      </p>
      {tag.detail ? (
        <p className="mt-0.5 truncate text-[8px] font-semibold uppercase leading-none">
          {tag.detail}
        </p>
      ) : null}
      <div className="mt-auto flex shrink-0 items-end justify-between gap-2 pt-0.5">
        <p className="text-[11px] font-bold leading-none">{tag.size}</p>
        <p className="text-[10px] font-bold leading-none">RATE: {tag.rateLabel}</p>
      </div>
    </div>
  );
}
