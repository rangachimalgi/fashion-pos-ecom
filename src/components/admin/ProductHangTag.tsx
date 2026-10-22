import { STORE_TAG_BRAND } from "@/lib/storeTag";
import type { HangTag } from "@/lib/storeTag";
import { TagBarcode } from "@/components/admin/TagBarcode";

export function ProductHangTag({ tag }: { tag: HangTag }) {
  return (
    <div className="product-hang-tag box-border flex h-[1in] w-[2in] flex-col overflow-hidden bg-white px-1.5 py-1 text-black [font-family:Arial,Helvetica,sans-serif]">
      <p className="text-center text-[7px] font-black leading-none">{STORE_TAG_BRAND}</p>
      <div className="flex h-[0.36in] items-center justify-center overflow-hidden">
        {tag.barcode ? <TagBarcode value={tag.barcode} /> : null}
      </div>
      <p className="truncate text-[10px] font-black uppercase leading-none">{tag.name}</p>
      <p className="truncate text-[8px] font-bold leading-none">
        {tag.code}
        {tag.detail ? ` ${tag.detail}` : ""}
      </p>
      <div className="mt-auto flex items-end justify-between">
        <p className="text-[11px] font-black leading-none">{tag.size}</p>
        <p className="text-[10px] font-black leading-none">RATE: {tag.rateLabel}</p>
      </div>
    </div>
  );
}
