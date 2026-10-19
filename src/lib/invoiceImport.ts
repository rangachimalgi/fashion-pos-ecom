import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { mutationHint, normalizeScanCode } from "@/lib/productAdmin";
import type { CategoryMeta, StoreDepartment } from "@/lib/categories";

export type InvoiceHeader = {
  index: number;
  label: string;
};

export type ParsedInvoice = {
  headers: InvoiceHeader[];
  rows: string[][];
  eanCol: number;
  nameCol: number;
  brandCol: number;
  styleCol: number;
  colorCol: number;
  sizeCol: number;
  qtyCol: number;
  mrpCol: number;
  suggestedTypeCol: number;
};

export type InvoiceLine = {
  row: number;
  ean: string;
  name: string;
  brand: string;
  style_code: string;
  color: string;
  size: string;
  qty: number;
  mrp: number;
  typeText: string;
  category: string | null;
  error: string | null;
};

export type ImportSummary = {
  productsCreated: number;
  variantsCreated: number;
  stockUpdated: number;
  categoriesUpdated: number;
  skipped: number;
};

const HEADER_MAP = {
  ean: ["ean code", "ean", "barcode", "scan code", "ean_code"],
  brand: ["brand"],
  name: ["product description", "description", "product name", "name", "item"],
  style: ["product code", "style", "style code", "sku", "article"],
  color: ["color", "colour"],
  size: ["size"],
  qty: ["qty", "quantity", "qty."],
  mrp: ["mrp", "price", "mrp (inr)", "mrp inr"],
  type: [
    "category",
    "product type",
    "article type",
    "item group",
    "group",
    "type",
    "product category",
    "garment",
  ],
} as const;

const TYPE_ALIASES: { tokens: string[] }[] = [
  { tokens: ["tshirt", "tshirts", "tee", "tees"] },
  { tokens: ["kurti", "kurtis", "kurta", "kurtas"] },
  { tokens: ["hoodie", "hoodies", "sweatshirt", "sweatshirts"] },
  { tokens: ["linen"] },
  { tokens: ["jeans", "jean", "denim"] },
  { tokens: ["trouser", "trousers", "pant", "pants"] },
  { tokens: ["shirt", "shirts"] },
];

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[_./]+/g, " ")
    .replace(/\s+/g, " ");
}

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pickColumn(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function cellText(value: unknown) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function parseQty(value: string) {
  const n = parseInt(value.replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseMrp(value: string) {
  const n = parseFloat(value.replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function looksScientific(value: string) {
  return /e[+-]?\d+/i.test(value);
}

export function guessCategory(
  text: string,
  categories: CategoryMeta[]
): string | null {
  if (!text.trim() || !categories.length) return null;
  const hay = compact(text);

  const byToken = new Map<string, CategoryMeta>();
  for (const category of categories) {
    byToken.set(compact(category.id), category);
    byToken.set(compact(category.label), category);
  }

  for (const { tokens } of TYPE_ALIASES) {
    if (!tokens.some((token) => hay.includes(token))) continue;
    for (const token of tokens) {
      const match = byToken.get(token);
      if (match) return match.id;
    }
  }

  const ranked = [...categories].sort(
    (a, b) => compact(b.label).length - compact(a.label).length
  );
  for (const category of ranked) {
    const token = compact(category.label);
    if (token.length >= 4 && hay.includes(token)) return category.id;
  }

  return null;
}

export function suggestTypeColumn(parsed: ParsedInvoice) {
  return parsed.suggestedTypeCol >= 0 ? parsed.suggestedTypeCol : parsed.nameCol;
}

type PdfSpan = { x: number; text: string };

function parsedFromMatrix(matrix: unknown[][]): ParsedInvoice {
  if (matrix.length < 2) {
    throw new Error("Need a header row and at least one product row.");
  }

  const normalized = matrix[0].map(normalizeHeader);
  const eanCol = pickColumn(normalized, HEADER_MAP.ean);
  const nameCol = pickColumn(normalized, HEADER_MAP.name);
  const typeCol = pickColumn(normalized, HEADER_MAP.type);

  if (eanCol < 0) {
    throw new Error(
      "Could not find an “EAN Code” column. Use the distributor invoice Excel or a text PDF with that header."
    );
  }
  if (nameCol < 0) {
    throw new Error("Could not find a “Product Description” column.");
  }

  const headers: InvoiceHeader[] = matrix[0].map((label, index) => ({
    index,
    label: cellText(label) || `Column ${index + 1}`,
  }));

  const rows = matrix.slice(1).map((row) =>
    headers.map((_, index) => cellText(row?.[index]))
  );

  return {
    headers,
    rows,
    eanCol,
    nameCol,
    brandCol: pickColumn(normalized, HEADER_MAP.brand),
    styleCol: pickColumn(normalized, HEADER_MAP.style),
    colorCol: pickColumn(normalized, HEADER_MAP.color),
    sizeCol: pickColumn(normalized, HEADER_MAP.size),
    qtyCol: pickColumn(normalized, HEADER_MAP.qty),
    mrpCol: pickColumn(normalized, HEADER_MAP.mrp),
    suggestedTypeCol: typeCol >= 0 ? typeCol : nameCol,
  };
}

function clusterPdfRows(spansByY: Map<number, PdfSpan[]>) {
  const rows = [...spansByY.entries()].sort((a, b) => b[0] - a[0]);
  return rows.map(([, spans]) => {
    const sorted = [...spans].sort((a, b) => a.x - b.x);
    const merged: PdfSpan[] = [];
    for (const span of sorted) {
      const last = merged[merged.length - 1];
      if (!last) {
        merged.push({ ...span });
        continue;
      }
      const gap = span.x - last.x - last.text.length * 4;
      if (gap < 10) {
        last.text += (gap < 2 ? "" : " ") + span.text;
      } else {
        merged.push({ ...span });
      }
    }
    return merged;
  });
}

function looksLikeHeaderRow(spans: PdfSpan[]) {
  const joined = normalizeHeader(spans.map((span) => span.text).join(" "));
  return (
    (joined.includes("ean") && joined.includes("code")) ||
    joined.includes("barcode") ||
    joined.includes("ean code")
  );
}

async function matrixFromPdf(buffer: ArrayBuffer): Promise<unknown[][]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const buckets = new Map<number, PdfSpan[]>();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = item.transform[4] as number;
      const y = Math.round((item.transform[5] as number) / 4) * 4;
      const list = buckets.get(y) ?? [];
      list.push({ x, text: String(item.str).replace(/\s+/g, " ").trim() });
      buckets.set(y, list);
    }
  }

  const clustered = clusterPdfRows(buckets);
  const headerIndex = clustered.findIndex(looksLikeHeaderRow);
  if (headerIndex < 0) {
    throw new Error(
      "Could not find an invoice table in this PDF (no EAN Code header). Use Excel, or a text PDF — photo scans will not work."
    );
  }

  const headerSpans = clustered[headerIndex];
  const columnXs = headerSpans.map((span) => span.x);
  const matrix: unknown[][] = [headerSpans.map((span) => span.text)];

  for (const spans of clustered.slice(headerIndex + 1)) {
    const joined = spans.map((span) => span.text).join(" ").toLowerCase();
    if (joined.includes("taxable value") && spans.length < 4) continue;
    if (/^(total|grand total|amount in words)/i.test(joined.trim())) break;

    const cells = headerSpans.map(() => "");
    for (const span of spans) {
      let col = 0;
      for (let i = 0; i < columnXs.length; i += 1) {
        const start = columnXs[i] - 8;
        const end = i + 1 < columnXs.length ? columnXs[i + 1] - 8 : Infinity;
        if (span.x >= start && span.x < end) {
          col = i;
          break;
        }
      }
      cells[col] = cells[col] ? `${cells[col]} ${span.text}` : span.text;
    }

    const hasEan = cells.some((cell) => /\d{12,18}/.test(cell.replace(/\s/g, "")));
    if (!hasEan) continue;
    matrix.push(cells);
  }

  return matrix;
}

export async function parseInvoiceFile(file: File): Promise<ParsedInvoice> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const matrix = await matrixFromPdf(buffer);
    return parsedFromMatrix(matrix);
  }

  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The spreadsheet is empty.");

  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  return parsedFromMatrix(matrix);
}

export function linesFromParsed(
  parsed: ParsedInvoice,
  typeCol: number,
  categories: CategoryMeta[]
): InvoiceLine[] {
  const lines: InvoiceLine[] = [];

  parsed.rows.forEach((cells, index) => {
    const rawEan = cells[parsed.eanCol] ?? "";
    const name = cells[parsed.nameCol] ?? "";
    const brand = parsed.brandCol >= 0 ? cells[parsed.brandCol] ?? "" : "";
    const style_code = parsed.styleCol >= 0 ? cells[parsed.styleCol] ?? "" : "";
    const color = parsed.colorCol >= 0 ? cells[parsed.colorCol] ?? "" : "";
    const size = parsed.sizeCol >= 0 ? cells[parsed.sizeCol] ?? "" : "";
    const qty = parsed.qtyCol >= 0 ? parseQty(cells[parsed.qtyCol] ?? "") : 0;
    const mrp = parsed.mrpCol >= 0 ? parseMrp(cells[parsed.mrpCol] ?? "") : 0;
    const ean = normalizeScanCode(rawEan);
    const typeText = (cells[typeCol] ?? "").trim() || name;
    const category = guessCategory(typeText, categories);

    if (!ean && !name) return;

    let error: string | null = null;
    if (looksScientific(rawEan) || looksScientific(ean)) {
      error = "EAN looks rounded by Excel. Set that column to Text and paste the code again.";
    } else if (!ean) {
      error = "Missing EAN Code.";
    } else if (!name) {
      error = "Missing product description.";
    } else if (qty < 1) {
      error = "Quantity must be 1 or more.";
    } else if (mrp <= 0) {
      error = "Missing MRP.";
    } else if (!category) {
      error = "Could not match a category. Add the type under Categories, or pick one here.";
    }

    lines.push({
      row: index + 2,
      ean,
      name,
      brand,
      style_code,
      color,
      size,
      qty: qty || 1,
      mrp,
      typeText,
      category,
      error,
    });
  });

  return lines;
}

function productKey(line: InvoiceLine) {
  const category = line.category ?? "";
  if (line.style_code) return `style:${line.style_code.toLowerCase()}|${category}`;
  return `name:${line.brand.toLowerCase()}|${line.name.toLowerCase()}|${category}`;
}

async function insertProduct(
  supabase: SupabaseClient,
  details: {
    name: string;
    brand: string;
    style_code: string | null;
    base_price: number;
    department: StoreDepartment;
    category: string;
  }
): Promise<string> {
  const payload = { ...details, image_url: null as string | null, description: null as string | null };

  let { data, error } = await supabase.from("products").insert([payload]).select("id").single();

  if (error?.message?.toLowerCase().includes("style_code") || error?.code === "PGRST204") {
    const { style_code: _ignored, ...withoutStyle } = payload;
    ({ data, error } = await supabase.from("products").insert([withoutStyle]).select("id").single());
  }

  if (error || !data) {
    throw new Error((error?.message || "Product was not created") + mutationHint(error?.message || "", error?.code));
  }

  return data.id as string;
}

async function updateProductCategory(
  supabase: SupabaseClient,
  productId: string,
  department: StoreDepartment,
  category: string
) {
  const { error } = await supabase
    .from("products")
    .update({ department, category })
    .eq("id", productId);
  if (error) throw new Error(error.message + mutationHint(error.message, error.code));
}

export async function importInvoiceLines(
  supabase: SupabaseClient,
  lines: InvoiceLine[],
  department: StoreDepartment,
  addStock: boolean
): Promise<ImportSummary> {
  const valid = lines.filter((line) => !line.error && line.category);
  const summary: ImportSummary = {
    productsCreated: 0,
    variantsCreated: 0,
    stockUpdated: 0,
    categoriesUpdated: 0,
    skipped: lines.length - valid.length,
  };

  if (!valid.length) return summary;

  const eans = [...new Set(valid.map((line) => line.ean))];
  const { data: existingVariants, error: variantLookupError } = await supabase
    .from("product_variants")
    .select("id, barcode, stock_quantity, product_id")
    .in("barcode", eans);

  if (variantLookupError) {
    throw new Error(variantLookupError.message + mutationHint(variantLookupError.message, variantLookupError.code));
  }

  const variantByEan = new Map(
    (existingVariants ?? []).map((row) => [
      String(row.barcode),
      row as { id: string; stock_quantity: number; product_id: string },
    ])
  );

  const styleCodes = [...new Set(valid.map((line) => line.style_code).filter(Boolean))];
  const productByStyle = new Map<string, string>();

  if (styleCodes.length) {
    const { data: existingProducts, error: productLookupError } = await supabase
      .from("products")
      .select("id, style_code")
      .in("style_code", styleCodes);

    if (
      productLookupError &&
      !productLookupError.message.toLowerCase().includes("style_code") &&
      productLookupError.code !== "PGRST204"
    ) {
      throw new Error(
        productLookupError.message + mutationHint(productLookupError.message, productLookupError.code)
      );
    }

    for (const row of existingProducts ?? []) {
      if (row.style_code) productByStyle.set(String(row.style_code).toLowerCase(), row.id as string);
    }
  }

  const groups = new Map<string, InvoiceLine[]>();
  for (const line of valid) {
    const key = productKey(line);
    const list = groups.get(key) ?? [];
    list.push(line);
    groups.set(key, list);
  }

  const recategorized = new Set<string>();

  for (const group of groups.values()) {
    const first = group[0];
    const category = first.category!;
    let productId =
      (first.style_code && productByStyle.get(first.style_code.toLowerCase())) || null;

    const merged = new Map<string, InvoiceLine>();
    for (const line of group) {
      const current = merged.get(line.ean);
      if (current) {
        current.qty += line.qty;
      } else {
        merged.set(line.ean, { ...line });
      }
    }

    if (!productId) {
      const fromEan = [...merged.keys()]
        .map((ean) => variantByEan.get(ean)?.product_id)
        .find(Boolean);
      if (fromEan) productId = fromEan;
    }

    const needsNewProduct = [...merged.values()].some((line) => !variantByEan.has(line.ean));

    if (!productId && needsNewProduct) {
      productId = await insertProduct(supabase, {
        name: first.name,
        brand: first.brand || "Unknown",
        style_code: first.style_code || null,
        base_price: first.mrp,
        department,
        category,
      });
      summary.productsCreated += 1;
      if (first.style_code) productByStyle.set(first.style_code.toLowerCase(), productId);
    }

    if (productId && !recategorized.has(productId)) {
      await updateProductCategory(supabase, productId, department, category);
      recategorized.add(productId);
      summary.categoriesUpdated += 1;
    }

    for (const line of merged.values()) {
      const existing = variantByEan.get(line.ean);
      if (existing) {
        if (addStock) {
          const { error } = await supabase
            .from("product_variants")
            .update({
              stock_quantity: existing.stock_quantity + line.qty,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          if (error) throw new Error(error.message + mutationHint(error.message, error.code));
          existing.stock_quantity += line.qty;
          summary.stockUpdated += 1;
        }
        continue;
      }

      if (!productId) {
        throw new Error("Could not attach a new size row to a product.");
      }

      const { error } = await supabase.from("product_variants").insert({
        product_id: productId,
        size: line.size || "OS",
        color: line.color || "Default",
        barcode: line.ean,
        stock_quantity: addStock ? line.qty : line.qty,
      });
      if (error) throw new Error(error.message + mutationHint(error.message, error.code));
      summary.variantsCreated += 1;
      variantByEan.set(line.ean, {
        id: "new",
        stock_quantity: line.qty,
        product_id: productId,
      });
    }
  }

  return summary;
}
