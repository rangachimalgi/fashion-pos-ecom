import { STORE_TAG_BRAND } from "@/lib/storeTag";
import type { HangTag } from "@/lib/storeTag";
import { TagBarcode } from "@/components/admin/TagBarcode";

export function ProductHangTag({ tag }: { tag: HangTag }) {
  return (
    <div className="product-hang-tag box-border flex h-[50mm] w-[55mm] flex-col overflow-hidden bg-white px-2 py-1.5 text-black [font-family:Arial,Helvetica,sans-serif]">
      <p className="text-center text-[8px] font-black leading-none">{STORE_TAG_BRAND}</p>
      <div className="my-1 flex h-[16mm] items-center justify-center overflow-hidden">
        {tag.barcode ? <TagBarcode value={tag.barcode} /> : null}
      </div>
      <p className="truncate text-[12px] font-black uppercase leading-tight">{tag.name}</p>
      <p className="truncate text-[9px] font-bold leading-tight">
        {tag.code}
        {tag.detail ? ` ${tag.detail}` : ""}
      </p>
      <div className="mt-auto flex items-end justify-between">
        <p className="text-[13px] font-black leading-none">{tag.size}</p>
        <p className="text-[12px] font-black leading-none">RATE: {tag.rateLabel}</p>
      </div>
    </div>
  );
}
