import { generated, pdfNumber, type Cell, type CellKind, type TableSpec } from "@/lib/purchaseReport";

/**
 * Landscape A4 PDF: title, a two-column summary block, then one table with a
 * totals row and page numbers. Amounts are plain numbers (the built-in PDF
 * font has no rupee sign), so say "Rs." in the subtitle.
 */
export async function exportTablePdf(args: {
  title: string;
  subtitle: string;
  summary: Array<[string, Cell, CellKind]>;
  heading?: string;
  table: TableSpec;
  fileName: string;
}) {
  const { title, subtitle, summary, heading, table, fileName } = args;
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, margin, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`${subtitle}  |  Generated ${generated()}  |  Amounts in Rs.`, margin, 50);
  doc.setTextColor(0);

  const half = Math.ceil(summary.length / 2);
  const summaryRows = Array.from({ length: half }, (_, index) => {
    const fmt = (item: [string, Cell, CellKind] | undefined) =>
      item ? [item[0], pdfNumber(item[1], item[2])] : ["", ""];
    return [...fmt(summary[index]), ...fmt(summary[index + half])];
  });
  autoTable(doc, {
    startY: 62,
    body: summaryRows,
    theme: "grid",
    tableWidth: "wrap",
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold" },
      1: { halign: "right" },
      2: { fontStyle: "bold" },
      3: { halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  let y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  if (heading) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(heading, margin, y + 22);
    y += 28;
  } else {
    y += 14;
  }

  const alignRight = table.cols.map((col) => col.kind !== "text");
  const small = table.cols.length > 12 ? 6.5 : 8;
  autoTable(doc, {
    startY: y,
    head: [table.cols.map((col) => col.header)],
    body: table.rows.map((row) => row.map((cell, index) => pdfNumber(cell, table.cols[index].kind))),
    foot: table.foot ? [table.foot.map((cell, index) => pdfNumber(cell, table.cols[index].kind))] : undefined,
    showFoot: "lastPage",
    theme: "striped",
    headStyles: { fillColor: [30, 30, 30], fontSize: small },
    footStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
    styles: { fontSize: small, cellPadding: 2.5 },
    didParseCell: (hook) => {
      if (alignRight[hook.column.index]) hook.cell.styles.halign = "right";
    },
    margin: { left: margin, right: margin, bottom: 32 },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Page ${page} of ${pages}`,
      doc.internal.pageSize.getWidth() - margin,
      doc.internal.pageSize.getHeight() - 14,
      { align: "right" }
    );
  }

  doc.save(fileName);
}
