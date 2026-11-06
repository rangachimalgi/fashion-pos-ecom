import type { HangTag } from "@/lib/storeTag";

/** A sticker position on the sheet: a tag, or null for a sticker that is left blank. */
export type TagSlot = HangTag | null;

export function chunkHangTagRows(slots: TagSlot[]) {
  const rows: Array<{ left: TagSlot; right: TagSlot }> = [];
  for (let i = 0; i < slots.length; i += 2) {
    rows.push({ left: slots[i], right: slots[i + 1] ?? null });
  }
  return rows;
}

// Driver paper (USER) is 101.6 x 152.4 mm, two stickers per row.
export const PAGE_HEIGHT_MM = 152; // a hair under 152.4 so a page never spills onto an extra sheet
export const TAG_HEIGHT_MM = 24.6;

/**
 * How many sticker rows fit on one sheet. The last row needs no gap after it,
 * so a sheet with 5 rows of stickers really holds 5 (not 4).
 */
export function rowsPerSheet(pitchMm: number, topMm: number) {
  const pitch = Math.max(TAG_HEIGHT_MM + 0.5, pitchMm);
  const room = PAGE_HEIGHT_MM - Math.max(0, topMm) - TAG_HEIGHT_MM;
  return Math.max(1, Math.floor(room / pitch) + 1);
}

export function printHangTags() {
  const previousTitle = document.title;
  const style = document.createElement("style");
  style.setAttribute("data-hangtags-print", "true");
  // Match the driver's USER paper exactly (4x6 in, portrait) so nothing gets rotated.
  style.textContent = "@media print { @page { size: 101.6mm 152.4mm; margin: 0; } }";
  document.head.appendChild(style);
  document.documentElement.classList.add("print-hangtags");
  document.title = " ";
  window.print();
  document.title = previousTitle;
  document.documentElement.classList.remove("print-hangtags");
  style.remove();
}
