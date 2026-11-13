"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, RotateCcw, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { STORE_DEPARTMENTS } from "@/lib/categories";
import { categoriesForDepartment, useStoreCategories } from "@/lib/storeCategories";
import { todayInShop } from "@/lib/salesReport";
import {
  GST_PRESETS,
  MARKUP_PRESETS,
  MRP_ROUND_STEP,
  lineValue,
  listSuppliers,
  purchaseTotals,
  round2,
  savePurchase,
  saveSupplier,
  suggestMrp,
  unitCost,
  type PurchaseLineInput,
  type Supplier,
} from "@/lib/purchases";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SIZE_FIELD_PLACEHOLDER, SIZE_SUGGESTIONS } from "@/lib/sizes";

type Row = {
  id: number;
  item: string;
  brand: string;
  cat: string; // "Women|Kurtis"
  design: string;
  color: string;
  size: string;
  hsn: string;
  qty: string;
  rate: string;
  disc: string;
  gst: string;
  markup: string;
  /** Typed MRP. null = follow cost + markup. */
  mrp: string | null;
};

const DEFAULTS = { disc: "0", gst: "5", markup: "30" };

function num(value: string) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function blankRow(id: number, from?: Row): Row {
  return {
    id,
    item: "",
    brand: "",
    cat: from?.cat ?? "",
    design: "",
    color: from?.color ?? "",
    size: "",
    hsn: from?.hsn ?? "",
    qty: "",
    rate: "",
    disc: from?.disc ?? DEFAULTS.disc,
    gst: from?.gst ?? DEFAULTS.gst,
    markup: from?.markup ?? DEFAULTS.markup,
    mrp: null,
  };
}

function isBlank(row: Row) {
  return !row.item.trim() && !row.qty.trim() && !row.rate.trim();
}

function compute(row: Row) {
  const qty = Math.floor(num(row.qty));
  const rate = num(row.rate);
  const disc = num(row.disc);
  const gst = num(row.gst);
  const cost = rate > 0 ? unitCost(rate, disc, gst) : 0;
  const markup = row.markup === "" ? null : num(row.markup);
  const auto = cost > 0 && markup != null ? suggestMrp(cost, markup) : 0;
  const mrp = row.mrp !== null ? round2(num(row.mrp)) : auto;
  const value = qty > 0 && rate > 0 ? lineValue(qty, rate, disc) : 0;
  return { qty, rate, disc, gst, cost, markup, auto, mrp, value };
}

function problemsFor(row: Row) {
  const c = compute(row);
  const list: string[] = [];
  if (!row.item.trim()) list.push("enter the item name");
  if (!row.cat) list.push("choose a category");
  if (!(Number.isInteger(num(row.qty)) && c.qty >= 1)) list.push("quantity must be a whole number, 1 or more");
  if (!(c.rate > 0)) list.push("enter the cost rate");
  if (c.disc < 0 || c.disc > 100) list.push("discount must be 0 to 100");
  if (c.gst < 0 || c.gst > 40) list.push("GST must be 0 to 40");
  if (!(c.mrp > 0)) list.push("enter the MRP (or pick a markup)");
  return list;
}

// One look for every box in the items table: same height, padding and text size.
const FIELD =
  "h-9 w-full rounded-md border-input bg-white px-2 text-[13px] shadow-none placeholder:text-muted-foreground/60";
const NUMBER_FIELD =
  "text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const SELECT_FIELD =
  "h-9 w-full rounded-md border border-input bg-white px-1.5 text-[13px] text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Column widths (px) of the items table, in order. */
const COLUMNS = [40, 180, 110, 160, 100, 90, 72, 64, 96, 68, 68, 88, 108, 92, 80, 112, 68];
const TABLE_WIDTH = COLUMNS.reduce((sum, width) => sum + width, 0);

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-2 py-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase", className)}>
      {children}
    </th>
  );
}

/**
 * What to offer in an item-name box: names already typed on other rows of this
 * purchase, nearest row first. An empty box offers the most recent name; a
 * partly typed one offers the first name that starts with what is typed.
 */
function suggestItemName(value: string, others: string[]): string {
  const typed = value.trim().toLowerCase();
  if (!typed) return others[0] ?? "";
  if (value !== value.trimStart()) return "";
  return others.find((name) => name.toLowerCase().startsWith(typed) && name.length > value.length) ?? "";
}

/** Item-name box that shows the suggestion as grey text after the cursor; Tab accepts it. */
function ItemNameInput({
  rowId,
  value,
  suggestion,
  onChange,
}: {
  rowId: number;
  value: string;
  suggestion: string;
  onChange: (value: string) => void;
}) {
  const showing = suggestion !== "" && suggestion.toLowerCase().startsWith(value.toLowerCase()) && suggestion !== value;
  return (
    <div className="relative w-full">
      {showing ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex h-9 items-center overflow-hidden border border-transparent px-2 text-[13px] whitespace-pre"
        >
          <span className="invisible">{value}</span>
          <span className="text-muted-foreground/60">{suggestion.slice(value.length)}</span>
        </div>
      ) : null}
      <Input
        data-item-input={rowId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Tab" && !event.shiftKey && showing) {
            event.preventDefault();
            onChange(suggestion);
          }
        }}
        placeholder={showing ? "" : "e.g. TSHIRT"}
        autoComplete="off"
        className={cn(FIELD, "relative")}
        title={showing ? "Press Tab to use the suggestion" : undefined}
      />
    </div>
  );
}

export default function NewPurchasePage() {
  const router = useRouter();
  const categoryRows = useStoreCategories();
  const categoryOptions = useMemo(
    () =>
      STORE_DEPARTMENTS.map((department) => ({
        department,
        items: categoriesForDepartment(department, categoryRows),
      })),
    [categoryRows]
  );

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierInput, setSupplierInput] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newGstin, setNewGstin] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [entryDate, setEntryDate] = useState(() => todayInShop());
  const [notes, setNotes] = useState("");
  const [roundOff, setRoundOff] = useState("");
  const [declared, setDeclared] = useState("");

  const [rows, setRows] = useState<Row[]>(() => [blankRow(1)]);
  const [nextId, setNextId] = useState(2);
  const [applyDisc, setApplyDisc] = useState(DEFAULTS.disc);
  const [applyGst, setApplyGst] = useState(DEFAULTS.gst);
  const [applyMarkup, setApplyMarkup] = useState(DEFAULTS.markup);

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSuppliers(supabase)
      .then((list) => {
        if (!cancelled) setSuppliers(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load suppliers");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matched = suppliers.find(
    (supplier) => supplier.name.trim().toLowerCase() === supplierInput.trim().toLowerCase()
  );
  const isNewSupplier = supplierInput.trim().length >= 2 && !matched;

  // Names typed so far, most recent row first, each name once (case-insensitive).
  const itemNamesNewestFirst = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ rowId: number; name: string }> = [];
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const name = rows[i].item.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      list.push({ rowId: rows[i].id, name });
    }
    return list;
  }, [rows]);

  const filled = rows.filter((row) => !isBlank(row));
  const computed = filled.map((row) => ({ row, c: compute(row) }));
  const totals = purchaseTotals(
    computed.map(({ c }) => ({ qty: Math.max(0, c.qty), rate: c.rate, disc: c.disc, gst: c.gst })),
    num(roundOff)
  );
  const declaredValue = declared.trim() === "" ? null : num(declared);
  const diff = declaredValue == null ? 0 : round2(declaredValue - totals.netInvoice);
  const belowCost = computed.filter(({ c }) => c.mrp > 0 && c.cost > 0 && c.mrp < c.cost).length;

  const dirty = !done && rows.some((row) => !isBlank(row));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (id: number, patch: Partial<Row>, resetMrp = false) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch, ...(resetMrp ? { mrp: null } : {}) } : row))
    );

  // After a row is added, the cursor goes straight to its item-name box.
  const focusAfterRender = useRef<number | null>(null);

  const addRow = () => {
    focusAfterRender.current = nextId;
    setRows((current) => [...current, blankRow(nextId, current[current.length - 1])]);
    setNextId((id) => id + 1);
  };

  useEffect(() => {
    const id = focusAfterRender.current;
    if (id === null) return;
    focusAfterRender.current = null;
    document.querySelector<HTMLInputElement>(`[data-item-input="${id}"]`)?.focus();
  }, [rows]);

  // Ctrl+Enter (Cmd+Enter on a Mac) adds a row, from anywhere on the page.
  useEffect(() => {
    if (done || saving) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      addRow();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // addRow only needs the latest nextId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, saving, nextId]);

  const cloneRow = (row: Row) => {
    setRows((current) => {
      const index = current.findIndex((entry) => entry.id === row.id);
      const copy = { ...row, id: nextId };
      return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    });
    setNextId((id) => id + 1);
  };

  const removeRow = (id: number) =>
    setRows((current) => (current.length === 1 ? [blankRow(nextId)] : current.filter((row) => row.id !== id)));

  const applyToAll = () => {
    setRows((current) =>
      current.map((row) => ({ ...row, disc: applyDisc, gst: applyGst, markup: applyMarkup, mrp: null }))
    );
  };

  const handleSave = async () => {
    if (saving) return;
    setError(null);

    const name = supplierInput.trim();
    if (name.length < 2) {
      setError("Choose or type the supplier name.");
      return;
    }
    if (filled.length === 0) {
      setError("Add at least one item.");
      return;
    }

    const bad = rows
      .map((row, index) => ({ row, index, list: isBlank(row) ? [] : problemsFor(row) }))
      .filter((entry) => entry.list.length > 0);
    if (bad.length > 0) {
      setShowProblems(true);
      setError(
        bad
          .slice(0, 6)
          .map((entry) => `Row ${entry.index + 1}: ${entry.list.join(", ")}.`)
          .join("\n") + (bad.length > 6 ? `\n…and ${bad.length - 6} more rows.` : "")
      );
      return;
    }

    setSaving(true);
    try {
      const supplierId =
        matched?.id ??
        (await saveSupplier(supabase, {
          name,
          address: newAddress,
          phone: newPhone,
          gstin: newGstin,
        }));

      const items: PurchaseLineInput[] = filled.map((row) => {
        const c = compute(row);
        const [department, category] = row.cat.split("|");
        return {
          item_name: row.item.trim(),
          brand: row.brand.trim(),
          design: row.design.trim(),
          department,
          category,
          color: row.color.trim(),
          size: row.size.trim(),
          hsn: row.hsn.trim(),
          qty: c.qty,
          rate: c.rate,
          disc_percent: c.disc,
          gst_percent: c.gst,
          markup_percent: c.markup,
          mrp: c.mrp,
        };
      });

      const saved = await savePurchase(
        supabase,
        {
          supplier_id: supplierId,
          supplier_invoice_no: invoiceNo,
          supplier_invoice_date: invoiceDate,
          entry_date: entryDate,
          round_off: num(roundOff),
          declared_total: declaredValue,
          notes,
        },
        items
      );

      setDone(true);
      router.push(`/admin/purchases/${saved.purchase_id}?saved=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the purchase");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 pt-6 pb-0 md:px-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">New purchase</h2>
        <p className="text-sm text-muted-foreground">
          Enter the supplier&apos;s bill. Stock, cost and barcodes are created when you save, and the entry number is
          assigned then.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      {/* ---------- Supplier and invoice ---------- */}
      <section className="rounded-xl border border-border bg-white p-5 shadow-xs">
        <h3 className="mb-4 text-sm font-semibold">Supplier &amp; invoice</h3>
        <div className="grid gap-4 md:grid-cols-12">
          <Field label="Supplier" className="md:col-span-5">
            <Input
              list="supplier-list"
              value={supplierInput}
              onChange={(event) => setSupplierInput(event.target.value)}
              placeholder="Pick a supplier, or type a new name"
              className="h-9"
            />
            <datalist id="purchase-size-suggestions">
              {SIZE_SUGGESTIONS.map((size) => (
                <option key={size} value={size} />
              ))}
            </datalist>
            <datalist id="supplier-list">
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Supplier invoice no." className="md:col-span-3">
            <Input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} className="h-9" />
          </Field>
          <Field label="Supplier invoice date" className="md:col-span-2">
            <Input
              type="date"
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
              className="h-9"
            />
          </Field>
          <Field label="Entry date" className="md:col-span-2">
            <Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className="h-9" />
          </Field>
        </div>

        {matched ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {[matched.address, matched.phone, matched.gstin].filter(Boolean).join(" · ") ||
              "No address saved for this supplier."}
          </p>
        ) : isNewSupplier ? (
          <div className="mt-4 rounded-lg bg-muted/40 p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              New supplier. It will be saved with this purchase. These details are optional.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                value={newAddress}
                onChange={(event) => setNewAddress(event.target.value)}
                placeholder="Address"
                className="h-9 bg-white"
              />
              <Input
                value={newPhone}
                onChange={(event) => setNewPhone(event.target.value)}
                placeholder="Phone"
                className="h-9 bg-white"
              />
              <Input
                value={newGstin}
                onChange={(event) => setNewGstin(event.target.value)}
                placeholder="GSTIN"
                className="h-9 bg-white"
              />
            </div>
          </div>
        ) : null}
      </section>

      {/* ---------- Items ---------- */}
      <section className="overflow-hidden rounded-xl border border-border bg-white shadow-xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold">Items</h3>
            <p className="text-xs text-muted-foreground">
              {filled.length} {filled.length === 1 ? "row" : "rows"} filled
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-xs font-medium text-muted-foreground">Set for every row</span>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Disc %
              <Input
                type="number"
                min={0}
                max={100}
                value={applyDisc}
                onChange={(event) => setApplyDisc(event.target.value)}
                className={cn(FIELD, NUMBER_FIELD, "w-20")}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              GST %
              <select
                value={applyGst}
                onChange={(event) => setApplyGst(event.target.value)}
                className={cn(SELECT_FIELD, "w-20")}
              >
                {GST_PRESETS.map((gst) => (
                  <option key={gst} value={String(gst)}>
                    {gst}%
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Profit %
              <select
                value={applyMarkup}
                onChange={(event) => setApplyMarkup(event.target.value)}
                className={cn(SELECT_FIELD, "w-20")}
              >
                {MARKUP_PRESETS.map((markup) => (
                  <option key={markup} value={String(markup)}>
                    {markup}%
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" size="sm" variant="outline" onClick={applyToAll}>
              Apply to all rows
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-fixed border-collapse text-left text-[13px]" style={{ width: TABLE_WIDTH }}>
            <colgroup>
              {COLUMNS.map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-neutral-50">
                <Th className="sticky left-0 z-10 bg-neutral-50 text-center">#</Th>
                <Th className="sticky left-10 z-10 bg-neutral-50 shadow-[1px_0_0_var(--border)]">Item name</Th>
                <Th>Brand</Th>
                <Th>Category</Th>
                <Th>Design</Th>
                <Th>Colour</Th>
                <Th>Size</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Cost rate</Th>
                <Th className="text-right">Disc %</Th>
                <Th className="text-right">GST %</Th>
                <Th>HSN</Th>
                <Th className="text-right">Value</Th>
                <Th className="text-right">Cost / pc</Th>
                <Th>Profit %</Th>
                <Th className="text-right">MRP</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const c = compute(row);
                const list = !isBlank(row) ? problemsFor(row) : [];
                const flagged = showProblems && list.length > 0;
                const manualMrp = row.mrp !== null && c.auto > 0 && c.mrp !== c.auto;
                const rowBg = flagged ? "bg-red-50" : "bg-white";
                return (
                  <tr key={row.id} className={cn("border-b border-border/70 align-middle", rowBg)}>
                    <td
                      className={cn("sticky left-0 z-10 px-2 py-1.5 text-center text-xs text-muted-foreground", rowBg)}
                      title={flagged ? list.join("; ") : undefined}
                    >
                      {flagged ? <span className="font-semibold text-destructive">!</span> : index + 1}
                    </td>
                    <td className={cn("sticky left-10 z-10 px-2 py-1.5 shadow-[1px_0_0_var(--border)]", rowBg)}>
                      <ItemNameInput
                        rowId={row.id}
                        value={row.item}
                        suggestion={suggestItemName(
                          row.item,
                          itemNamesNewestFirst.filter((entry) => entry.rowId !== row.id).map((entry) => entry.name)
                        )}
                        onChange={(item) => update(row.id, { item })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={row.brand}
                        onChange={(event) => update(row.id, { brand: event.target.value })}
                        placeholder="optional"
                        className={FIELD}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={row.cat}
                        onChange={(event) => update(row.id, { cat: event.target.value })}
                        className={SELECT_FIELD}
                      >
                        <option value="">Choose…</option>
                        {categoryOptions.map((group) => (
                          <optgroup key={group.department} label={group.department}>
                            {group.items.map((category) => (
                              <option key={category.id} value={`${group.department}|${category.id}`}>
                                {category.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={row.design}
                        onChange={(event) => update(row.id, { design: event.target.value })}
                        placeholder="auto"
                        className={FIELD}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={row.color}
                        onChange={(event) => update(row.id, { color: event.target.value })}
                        className={FIELD}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={row.size}
                        onChange={(event) => update(row.id, { size: event.target.value })}
                        placeholder={SIZE_FIELD_PLACEHOLDER}
                        list="purchase-size-suggestions"
                        className={FIELD}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={1}
                        value={row.qty}
                        onChange={(event) => update(row.id, { qty: event.target.value })}
                        className={cn(FIELD, NUMBER_FIELD)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.rate}
                        onChange={(event) => update(row.id, { rate: event.target.value }, true)}
                        className={cn(FIELD, NUMBER_FIELD)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={row.disc}
                        onChange={(event) => update(row.id, { disc: event.target.value }, true)}
                        className={cn(FIELD, NUMBER_FIELD)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={40}
                        step="0.01"
                        value={row.gst}
                        onChange={(event) => update(row.id, { gst: event.target.value }, true)}
                        className={cn(FIELD, NUMBER_FIELD)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={row.hsn}
                        onChange={(event) => update(row.id, { hsn: event.target.value })}
                        className={FIELD}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                      {c.value > 0 ? money(c.value) : <span className="text-muted-foreground/60">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                      {c.cost > 0 ? money(c.cost) : <span className="text-muted-foreground/60">—</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={row.markup}
                        onChange={(event) => update(row.id, { markup: event.target.value }, true)}
                        className={SELECT_FIELD}
                      >
                        <option value="">—</option>
                        {MARKUP_PRESETS.map((markup) => (
                          <option key={markup} value={String(markup)}>
                            {markup}%
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.mrp !== null ? row.mrp : c.auto > 0 ? String(c.auto) : ""}
                          onChange={(event) => update(row.id, { mrp: event.target.value })}
                          className={cn(FIELD, NUMBER_FIELD, "font-semibold", manualMrp && "border-amber-400 pr-7")}
                        />
                        {manualMrp ? (
                          <button
                            type="button"
                            onClick={() => update(row.id, { mrp: null })}
                            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-amber-700 hover:bg-amber-100"
                            title={`You typed this MRP. Click to go back to ${c.auto}`}
                          >
                            <RotateCcw className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => cloneRow(row)}
                          title="Duplicate this row"
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Copy className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          title="Remove this row"
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-destructive"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-muted/20 px-5 py-3">
          <Button type="button" size="sm" variant="outline" onClick={addRow} className="gap-1.5">
            <Plus className="size-3.5" />
            Add row
          </Button>
          <span className="text-xs text-muted-foreground">
            <kbd className="rounded border border-border bg-white px-1.5 py-0.5 font-sans text-[10px]">Ctrl</kbd>
            {" + "}
            <kbd className="rounded border border-border bg-white px-1.5 py-0.5 font-sans text-[10px]">Enter</kbd>
            {" "}(⌘ + Enter on a Mac) adds a row. On a new row, <b className="font-medium">Tab</b> accepts the
            suggested item name.
          </span>
        </div>
        <div className="space-y-1 border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <p>
            MRP = cost after discount + GST, plus the profit %, rounded up to the next ₹{MRP_ROUND_STEP}. You can type
            any MRP on a row.
          </p>
          <p>
            The same item name at a different cost rate becomes its own product with its own MRP and barcode. Sizes at
            the same cost stay together as one product.
          </p>
        </div>
      </section>

      {/* ---------- Totals ---------- */}
      <section className="grid gap-6 rounded-xl border border-border bg-white p-5 shadow-xs md:grid-cols-2">
        <div className="space-y-4">
          <Field label="Notes (optional)">
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} className="h-9" />
          </Field>
          <div className="flex flex-wrap gap-4">
            <Field label="Total on the supplier's bill (to check)">
              <Input
                type="number"
                step="0.01"
                value={declared}
                onChange={(event) => setDeclared(event.target.value)}
                className="h-9 w-52"
              />
            </Field>
            <Field label="Round off">
              <Input
                type="number"
                step="0.01"
                value={roundOff}
                onChange={(event) => setRoundOff(event.target.value)}
                className="h-9 w-28"
              />
            </Field>
          </div>
          {declaredValue != null && Math.abs(diff) > 0.005 ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Our total is ₹{money(totals.netInvoice)}; the supplier&apos;s bill says ₹{money(declaredValue)} (
              {diff > 0 ? "+" : "−"}₹{money(Math.abs(diff))}).{" "}
              {Math.abs(diff) <= 5 ? (
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => setRoundOff(String(round2(num(roundOff) + diff)))}
                >
                  Put the difference in round off
                </button>
              ) : (
                "Check the rates, discount and GST."
              )}
            </p>
          ) : declaredValue != null ? (
            <p className="text-xs text-emerald-700">Matches the supplier&apos;s bill.</p>
          ) : null}
          {belowCost > 0 ? (
            <p className="text-xs text-amber-700">
              {belowCost} row{belowCost === 1 ? "" : "s"} have an MRP below the cost per piece.
            </p>
          ) : null}
        </div>

        <dl className="grid h-fit grid-cols-[1fr_auto] gap-x-8 gap-y-2 rounded-lg bg-muted/40 p-4 text-sm tabular-nums">
          <dt className="text-muted-foreground">Pieces</dt>
          <dd className="text-right">{totals.pieces}</dd>
          <dt className="text-muted-foreground">Value (qty × rate)</dt>
          <dd className="text-right">{money(totals.gross)}</dd>
          <dt className="text-muted-foreground">Supplier discount</dt>
          <dd className="text-right">− {money(totals.discount)}</dd>
          <dt className="text-muted-foreground">Net items</dt>
          <dd className="text-right">{money(totals.netItems)}</dd>
          <dt className="text-muted-foreground">CGST</dt>
          <dd className="text-right">{money(totals.cgst)}</dd>
          <dt className="text-muted-foreground">SGST</dt>
          <dd className="text-right">{money(totals.sgst)}</dd>
          <dt className="text-muted-foreground">Round off</dt>
          <dd className="text-right">{money(totals.roundOff)}</dd>
          <dt className="border-t border-border pt-2.5 font-semibold">Net invoice</dt>
          <dd className="border-t border-border pt-2.5 text-right text-xl font-semibold">
            ₹{money(totals.netInvoice)}
          </dd>
        </dl>
      </section>

      {/* Always in reach: the running total and the save button. */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-1 flex items-center gap-4 border-t border-border bg-white/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="text-sm">
          <span className="text-muted-foreground">Net invoice </span>
          <span className="text-base font-semibold tabular-nums">₹{money(totals.netInvoice)}</span>
          <span className="ml-3 text-muted-foreground tabular-nums">{totals.pieces} pcs</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/admin/purchases" className={buttonVariants({ variant: "ghost" })}>
            Cancel
          </Link>
          <Button type="button" onClick={handleSave} disabled={saving} className="min-w-44">
            {saving ? "Saving…" : "Save purchase & add stock"}
          </Button>
        </div>
      </div>
    </div>
  );
}
