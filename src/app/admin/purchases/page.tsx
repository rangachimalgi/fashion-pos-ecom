"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { listPurchases, type PurchaseSummary } from "@/lib/purchases";
import { periodLabel } from "@/lib/salesReport";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function inr(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<PurchaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listPurchases(supabase)
      .then((list) => {
        if (cancelled) return;
        setPurchases(list);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load purchases");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((purchase) =>
      [purchase.supplier_name, purchase.supplier_invoice_no, String(purchase.entry_no)]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [purchases, query]);

  const totals = useMemo(
    () =>
      shown.reduce(
        (sum, purchase) => ({
          pieces: sum.pieces + purchase.total_pieces,
          amount: sum.amount + purchase.net_invoice,
        }),
        { pieces: 0, amount: 0 }
      ),
    [shown]
  );

  return (
    <div className="px-4 py-6 md:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Every supplier bill you enter. Saving a purchase creates the products and sizes and adds the stock.
        </p>
        <div className="relative ml-auto">
          <Search className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Supplier, invoice no, entry no"
            className="h-9 w-64 bg-white pl-8"
          />
        </div>
        <Link href="/admin/purchases/new" className={cn(buttonVariants(), "gap-1.5")}>
          <Plus className="size-4" />
          New purchase
        </Link>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entry no.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Supplier invoice</TableHead>
              <TableHead className="text-right">Pieces</TableHead>
              <TableHead className="text-right">Net invoice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {purchases.length === 0 ? "No purchases yet." : "Nothing matches your search."}
                </TableCell>
              </TableRow>
            ) : (
              shown.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/purchases/${purchase.id}`} className="hover:underline">
                      #{purchase.entry_no}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{periodLabel(purchase.entry_date, "day")}</TableCell>
                  <TableCell>{purchase.supplier_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {purchase.supplier_invoice_no || "—"}
                    {purchase.supplier_invoice_date
                      ? ` · ${periodLabel(purchase.supplier_invoice_date, "day")}`
                      : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{purchase.total_pieces}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {inr(purchase.net_invoice)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {!loading && shown.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="font-semibold">
                  Total ({shown.length} purchase{shown.length === 1 ? "" : "s"})
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{totals.pieces}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{inr(totals.amount)}</TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </div>
  );
}
