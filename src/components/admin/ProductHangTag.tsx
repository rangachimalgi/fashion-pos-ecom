import { STORE_TAG_BRAND } from "@/lib/storeTag";
import type { HangTag } from "@/lib/storeTag";
import { TagBarcode } from "@/components/admin/TagBarcode";

/** One sticker: 45 x 25 mm content ; printed 45 wide to fit the 101.6 mm driver paper. */
export function ProductHangTag({ tag }: { tag: HangTag }) {
  return (
    <div className="product-hang-tag box-border flex h-[25mm] w-[45mm] flex-col overflow-hidden bg-white px-[1.5mm] py-[0.8mm] text-black [font-family:Arial,Helvetica,sans-serif]">
      <p className="truncate text-center text-[6.5px] font-black uppercase leading-none tracking-wide">
        {STORE_TAG_BRAND}
      </p>
      <div className="mt-[0.6mm] flex h-[8mm] shrink-0 items-center justify-center overflow-hidden">
        {tag.barcode ? <TagBarcode value={tag.barcode} /> : null}
      </div>
      <p className="mt-[0.6mm] truncate text-[7.5px] font-black uppercase leading-none">
        {tag.code} {tag.name}
      </p>
      {tag.detail ? (
        <p className="mt-[0.5mm] truncate text-[7.5px] font-black uppercase leading-none">
          {tag.detail}
        </p>
      ) : null}
      <div className="mt-auto flex items-end justify-between gap-1">
        <p className="text-[10px] font-black leading-none">{tag.size}</p>
        <p className="text-right text-[8px] font-black leading-none">
          RATE: <span className="text-[11px]">{tag.rateLabel}</span>
        </p>
      </div>
    </div>
  );
}
