"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, X } from "lucide-react";
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

const cell = "h-8 px-1.5 text-sm";

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

  const addRow = () => {
    setRows((current) => [...current, blankRow(nextId, current[current.length - 1])]);
    setNextId((id) => id + 1);
  };

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
    <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
      {/* ---------- Supplier and invoice ---------- */}
      <section className="rounded-xl border border-border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">
            Supplier
            <Input
              list="supplier-list"
              value={supplierInput}
              onChange={(event) => setSupplierInput(event.target.value)}
              placeholder="Pick a supplier, or type a new name"
              className="h-9"
            />
            <datalist id="supplier-list">
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.name} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Supplier invoice no.
            <Input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} className="h-9" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Supplier invoice date
            <Input
              type="date"
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
              className="h-9"
            />
          </label>

          {matched ? (
            <p className="text-xs text-muted-foreground md:col-span-2">
              {[matched.address, matched.phone, matched.gstin].filter(Boolean).join(" · ") ||
                "No address saved for this supplier."}
            </p>
          ) : isNewSupplier ? (
            <div className="grid gap-2 md:col-span-2 md:grid-cols-3">
              <Input
                value={newAddress}
                onChange={(event) => setNewAddress(event.target.value)}
                placeholder="Address (optional)"
                className="h-8"
              />
              <Input
                value={newPhone}
                onChange={(event) => setNewPhone(event.target.value)}
                placeholder="Phone (optional)"
                className="h-8"
              />
              <Input
                value={newGstin}
                onChange={(event) => setNewGstin(event.target.value)}
                placeholder="GSTIN (optional)"
                className="h-8"
              />
              <p className="text-[11px] text-muted-foreground md:col-span-3">
                New supplier — it will be saved with this purchase.
              </p>
            </div>
          ) : (
            <span className="md:col-span-2" />
          )}

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Entry date
            <Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className="h-9" />
          </label>
          <p className="flex flex-col gap-1 text-xs text-muted-foreground">
            Entry no.
            <span className="flex h-9 items-center text-sm text-foreground">Assigned when you save</span>
          </p>
        </div>
      </section>

      {/* ---------- Apply to all ---------- */}
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white px-4 py-3">
        <p className="mr-2 text-sm font-medium">Set for every row</p>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Supplier disc %
          <Input
            type="number"
            min={0}
            max={100}
            value={applyDisc}
            onChange={(event) => setApplyDisc(event.target.value)}
            className="h-8 w-24"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          GST %
          <select
            value={applyGst}
            onChange={(event) => setApplyGst(event.target.value)}
            className="h-8 w-24 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
          >
            {GST_PRESETS.map((gst) => (
              <option key={gst} value={String(gst)}>
                {gst}%
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Profit % on cost
          <select
            value={applyMarkup}
            onChange={(event) => setApplyMarkup(event.target.value)}
            className="h-8 w-24 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
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
        <p className="ml-auto max-w-sm text-[11px] text-muted-foreground">
          MRP = cost after discount + GST, plus the profit %, rounded up to the next ₹{MRP_ROUND_STEP}. You can
          type any MRP on a row.
        </p>
      </section>

      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      {/* ---------- Items ---------- */}
      <section className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[1320px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] tracking-wide text-muted-foreground uppercase">
              <th className="px-2 py-2">#</th>
              <th className="px-1 py-2">Item name</th>
              <th className="px-1 py-2">Brand</th>
              <th className="px-1 py-2">Category</th>
              <th className="px-1 py-2">Design</th>
              <th className="px-1 py-2">Colour</th>
              <th className="px-1 py-2">Size</th>
              <th className="px-1 py-2">Qty</th>
              <th className="px-1 py-2">Cost rate</th>
              <th className="px-1 py-2">Disc %</th>
              <th className="px-1 py-2">GST %</th>
              <th className="px-1 py-2">HSN</th>
              <th className="px-2 py-2 text-right">Value</th>
              <th className="px-1 py-2">Profit %</th>
              <th className="px-1 py-2">MRP</th>
              <th className="px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const c = compute(row);
              const list = !isBlank(row) ? problemsFor(row) : [];
              const flagged = showProblems && list.length > 0;
              const manualMrp = row.mrp !== null && c.auto > 0 && c.mrp !== c.auto;
              return (
                <tr key={row.id} className={cn("border-b border-border/60", flagged && "bg-destructive/5")}>
                  <td className="px-2 py-1 text-xs text-muted-foreground">{index + 1}</td>
                  <td className="px-1 py-1">
                    <Input
                      value={row.item}
                      onChange={(event) => update(row.id, { item: event.target.value })}
                      placeholder="e.g. TSHIRT"
                      className={cn(cell, "w-40")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={row.brand}
                      onChange={(event) => update(row.id, { brand: event.target.value })}
                      placeholder="optional"
                      className={cn(cell, "w-24")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={row.cat}
                      onChange={(event) => update(row.id, { cat: event.target.value })}
                      className={cn(cell, "w-36 rounded-lg border border-input bg-transparent")}
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
                  <td className="px-1 py-1">
                    <Input
                      value={row.design}
                      onChange={(event) => update(row.id, { design: event.target.value })}
                      placeholder="auto"
                      className={cn(cell, "w-24")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={row.color}
                      onChange={(event) => update(row.id, { color: event.target.value })}
                      className={cn(cell, "w-20")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={row.size}
                      onChange={(event) => update(row.id, { size: event.target.value })}
                      placeholder="OS"
                      className={cn(cell, "w-16")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={1}
                      value={row.qty}
                      onChange={(event) => update(row.id, { qty: event.target.value })}
                      className={cn(cell, "w-16")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.rate}
                      onChange={(event) => update(row.id, { rate: event.target.value }, true)}
                      className={cn(cell, "w-24")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={row.disc}
                      onChange={(event) => update(row.id, { disc: event.target.value }, true)}
                      className={cn(cell, "w-16")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      step="0.01"
                      value={row.gst}
                      onChange={(event) => update(row.id, { gst: event.target.value }, true)}
                      className={cn(cell, "w-16")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={row.hsn}
                      onChange={(event) => update(row.id, { hsn: event.target.value })}
                      className={cn(cell, "w-20")}
                    />
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {c.value > 0 ? money(c.value) : "—"}
                    {c.cost > 0 ? (
                      <span className="block text-[10px] text-muted-foreground">cost/pc {money(c.cost)}</span>
                    ) : null}
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={row.markup}
                      onChange={(event) => update(row.id, { markup: event.target.value }, true)}
                      className={cn(cell, "w-20 rounded-lg border border-input bg-transparent")}
                    >
                      <option value="">—</option>
                      {MARKUP_PRESETS.map((markup) => (
                        <option key={markup} value={String(markup)}>
                          {markup}%
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.mrp !== null ? row.mrp : c.auto > 0 ? String(c.auto) : ""}
                      onChange={(event) => update(row.id, { mrp: event.target.value })}
                      className={cn(cell, "w-24 font-semibold", manualMrp && "border-amber-400")}
                    />
                    {manualMrp ? (
                      <button
                        type="button"
                        onClick={() => update(row.id, { mrp: null })}
                        className="block text-[10px] text-amber-700 hover:underline"
                        title={`Back to ${c.auto}`}
                      >
                        typed · reset to {c.auto}
                      </button>
                    ) : null}
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => cloneRow(row)}
                        title="Duplicate this row"
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                      >
                        <Copy className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        title="Remove this row"
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
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
        <div className="flex items-center gap-3 border-t border-border px-3 py-2">
          <Button type="button" size="sm" variant="outline" onClick={addRow} className="gap-1.5">
            <Plus className="size-3.5" />
            Add row
          </Button>
          <p className="text-[11px] text-muted-foreground">
            The same item name at a different cost rate becomes its own product with its own MRP and barcode.
            Sizes at the same cost stay together as one product.
          </p>
        </div>
      </section>

      {/* ---------- Totals ---------- */}
      <section className="grid gap-4 rounded-xl border border-border bg-white p-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Notes (optional)
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} className="h-9" />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Total on the supplier&apos;s bill (to check)
              <Input
                type="number"
                step="0.01"
                value={declared}
                onChange={(event) => setDeclared(event.target.value)}
                className="h-9 w-48"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Round off
              <Input
                type="number"
                step="0.01"
                value={roundOff}
                onChange={(event) => setRoundOff(event.target.value)}
                className="h-9 w-28"
              />
            </label>
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

        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm tabular-nums">
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
          <dt className="border-t border-border pt-1.5 font-semibold">Net invoice</dt>
          <dd className="border-t border-border pt-1.5 text-right text-lg font-bold">
            ₹{money(totals.netInvoice)}
          </dd>
        </dl>
      </section>

      <div className="flex items-center justify-end gap-2">
        <Link href="/admin/purchases" className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
        <Button type="button" onClick={handleSave} disabled={saving} className="min-w-40">
          {saving ? "Saving…" : "Save purchase & add stock"}
        </Button>
      </div>
    </div>
  );
}
