import { STORE_TAG_BRAND } from "@/lib/storeTag";
import type { HangTag } from "@/lib/storeTag";
import { TagBarcode } from "@/components/admin/TagBarcode";

export function ProductHangTag({ tag }: { tag: HangTag }) {
  return (
    <div className="product-hang-tag box-border flex h-[50mm] w-[55mm] flex-col overflow-hidden bg-white px-1.5 py-1 text-black [font-family:Arial,Helvetica,sans-serif]">
      <p className="text-center text-[8px] font-black uppercase leading-none tracking-wide">
        {STORE_TAG_BRAND}
      </p>
      <div className="mt-0.5 flex h-[14mm] items-center justify-center overflow-hidden">
        {tag.barcode ? <TagBarcode value={tag.barcode} /> : null}
      </div>
      <p className="mt-0.5 truncate text-[10px] font-black uppercase leading-none">
        {tag.code} {tag.name}
      </p>
      {tag.detail ? (
        <p className="mt-0.5 truncate text-[10px] font-black uppercase leading-none">
          {tag.detail}
        </p>
      ) : null}
      <div className="mt-auto flex items-end justify-between gap-1">
        <p className="text-[12px] font-black leading-none">{tag.size}</p>
        <p className="text-right text-[11px] font-black leading-none">
          RATE: <span className="text-[14px]">{tag.rateLabel}</span>
        </p>
      </div>
    </div>
  );
}
