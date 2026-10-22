import { STORE_TAG_BRAND } from "@/lib/storeTag";
import type { HangTag } from "@/lib/storeTag";
import { TagBarcode } from "@/components/admin/TagBarcode";

export function ProductHangTag({ tag }: { tag: HangTag }) {
  return (
    <div className="product-hang-tag box-border flex h-[24mm] w-[48mm] items-center gap-1 overflow-hidden bg-white px-1 py-0.5 text-black [font-family:Arial,Helvetica,sans-serif]">
      <div className="flex h-[18mm] w-[22mm] shrink-0 items-center justify-center overflow-hidden">
        {tag.barcode ? <TagBarcode value={tag.barcode} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[6px] font-black leading-none tracking-wide">
          {STORE_TAG_BRAND}
        </p>
        <p className="mt-0.5 truncate text-[8px] font-black uppercase leading-none">
          {tag.name}
        </p>
        <p className="truncate text-[7px] font-bold leading-none">{tag.code}</p>
        {tag.detail ? (
          <p className="truncate text-[7px] font-bold uppercase leading-none">{tag.detail}</p>
        ) : null}
        <div className="mt-0.5 flex items-end justify-between gap-1">
          <p className="text-[9px] font-black leading-none">{tag.size}</p>
          <p className="text-[8px] font-black leading-none">RATE:{tag.rateLabel}</p>
        </div>
      </div>
    </div>
  );
}
