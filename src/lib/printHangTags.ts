import type { HangTag } from "@/lib/storeTag";

export function chunkHangTagRows(tags: HangTag[]) {
  const rows: Array<{ left: HangTag; right: HangTag | null }> = [];
  for (let i = 0; i < tags.length; i += 2) {
    rows.push({ left: tags[i], right: tags[i + 1] ?? null });
  }
  return rows;
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
