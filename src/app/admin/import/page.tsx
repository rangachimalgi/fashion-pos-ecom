"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { STORE_DEPARTMENTS, type StoreDepartment } from "@/lib/categories";
import { categoriesForDepartment, useStoreCategories } from "@/lib/storeCategories";
import {
  importInvoiceLines,
  linesFromParsed,
  parseInvoiceFile,
  suggestTypeColumn,
  type InvoiceLine,
  type ParsedInvoice,
} from "@/lib/invoiceImport";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminImportPage() {
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null);
  const [typeCol, setTypeCol] = useState(0);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [fileName, setFileName] = useState<string | null>(null);
  const [department, setDepartment] = useState<StoreDepartment>("Men");
  const [addStock, setAddStock] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const categoryRows = useStoreCategories();
  const departmentCategories = categoriesForDepartment(department, categoryRows);

  const guessedLines = useMemo(() => {
    if (!parsed) return null;
    return linesFromParsed(parsed, typeCol, departmentCategories);
  }, [parsed, typeCol, departmentCategories]);

  const lines = useMemo(() => {
    if (!guessedLines) return null;
    return guessedLines.map((line) => {
      const override = overrides[line.row];
      if (!override) return line;
      const next: InvoiceLine = { ...line, category: override };
      if (next.error?.startsWith("Could not match a category")) {
        next.error = null;
      }
      return next;
    });
  }, [guessedLines, overrides]);

  const validCount = useMemo(
    () => (lines ?? []).filter((line) => !line.error && line.category).length,
    [lines]
  );
  const errorCount = (lines?.length ?? 0) - validCount;

  useEffect(() => {
    setOverrides({});
  }, [typeCol, department]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setParsing(true);
    setError(null);
    setResult(null);
    setParsed(null);
    setOverrides({});
    setFileName(file.name);

    try {
      const next = await parseInvoiceFile(file);
      setParsed(next);
      setTypeCol(suggestTypeColumn(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!lines?.length || saving) return;
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const summary = await importInvoiceLines(supabase, lines, department, addStock);
      setResult(
        `Created ${summary.productsCreated} product(s), ${summary.variantsCreated} new EAN row(s), updated stock on ${summary.stockUpdated}, set category on ${summary.categoriesUpdated}. Skipped ${summary.skipped} row(s).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 px-4 py-6 md:px-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Upload the distributor invoice as Excel, CSV, or PDF. We read EAN, Product Code,
        MRP, size, and qty. Product type comes from the column you pick — we match the{" "}
        <span className="font-medium text-foreground">values</span> (T.SHIRT, kurta,
        trouser…) to your Categories. PDFs must be text (not a photo scan).
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Invoice file</label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={handleFile}
              disabled={parsing || saving}
            />
            {fileName ? (
              <p className="text-[11px] text-muted-foreground">{fileName}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Department</label>
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value as StoreDepartment)}
              className="flex h-8 min-w-32 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
            >
              {STORE_DEPARTMENTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          {parsed ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Type is in this column
              </label>
              <select
                value={typeCol}
                onChange={(event) => setTypeCol(Number(event.target.value))}
                className="flex h-8 min-w-44 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
              >
                {parsed.headers.map((header) => (
                  <option key={header.index} value={header.index}>
                    {header.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <Button
            type="button"
            disabled={!validCount || saving || parsing}
            onClick={handleImport}
            className="gap-1.5"
          >
            <FileSpreadsheet className="size-3.5" />
            {saving ? "Importing…" : validCount ? `Import ${validCount}` : "Import"}
          </Button>
        </div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={addStock}
            onChange={(event) => setAddStock(event.target.checked)}
          />
          <span>
            Add quantities to stock.{" "}
            <span className="text-foreground">
              Uncheck this if you are re-uploading the same sheet only to fix Tshirts →
              the right type. Leave it checked for a new delivery.
            </span>
          </span>
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive whitespace-pre-wrap">
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          {result}{" "}
          <Link href="/admin" className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}>
            Open catalog
          </Link>
        </div>
      ) : null}

      {parsing ? (
        <p className="text-sm text-muted-foreground">Reading sheet…</p>
      ) : null}

      {lines ? (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 pl-4 text-xs text-muted-foreground">Row</TableHead>
                <TableHead className="h-11 text-xs text-muted-foreground">EAN</TableHead>
                <TableHead className="h-11 text-xs text-muted-foreground">Product</TableHead>
                <TableHead className="h-11 text-xs text-muted-foreground">Code</TableHead>
                <TableHead className="h-11 text-xs text-muted-foreground">Category</TableHead>
                <TableHead className="h-11 text-xs text-muted-foreground">Size</TableHead>
                <TableHead className="h-11 pr-4 text-xs text-muted-foreground">MRP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No product rows in that file.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((line) => (
                  <TableRow key={`${line.row}-${line.ean}`}>
                    <TableCell className="pl-4 text-xs text-muted-foreground">{line.row}</TableCell>
                    <TableCell className="font-mono text-xs">{line.ean || "—"}</TableCell>
                    <TableCell className="text-sm">
                      <p>{line.name || "—"}</p>
                      {line.error ? (
                        <p className="text-xs text-destructive">{line.error}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {line.brand}
                          {line.color ? ` · ${line.color}` : ""}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{line.style_code || "—"}</TableCell>
                    <TableCell>
                      <select
                        value={line.category ?? ""}
                        onChange={(event) =>
                          setOverrides((current) => ({
                            ...current,
                            [line.row]: event.target.value,
                          }))
                        }
                        className={cn(
                          "flex h-8 w-full min-w-28 rounded-lg border bg-transparent px-2 text-xs outline-none",
                          line.category ? "border-input" : "border-destructive/40"
                        )}
                      >
                        <option value="">Pick…</option>
                        {departmentCategories.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="text-sm">{line.size || "—"}</TableCell>
                    <TableCell className="pr-4 text-sm">
                      {line.mrp ? `₹${line.mrp}` : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {errorCount > 0 ? (
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              {errorCount} row(s) skipped until EAN/MRP/category is fixed.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
