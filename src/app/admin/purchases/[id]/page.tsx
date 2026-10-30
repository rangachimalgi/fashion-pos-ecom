"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Printer, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { deletePurchase, getPurchase, type PurchaseDetail } from "@/lib/purchases";
import { periodLabel } from "@/lib/salesReport";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function money(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PurchaseDetailPage() {
  return (
    <Suspense fallback={<p className="px-6 py-8 text-sm text-muted-foreground">Loading…</p>}>
      <PurchaseDetailInner />
    </Suspense>
  );
}

function PurchaseDetailInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id;
  const justSaved = searchParams.get("saved") === "1";

  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPurchase(supabase, id)
      .then((next) => {
        if (cancelled) return;
        setPurchase(next);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load this purchase");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDelete = async () => {
    if (!purchase || deleting) return;
    const ok = window.confirm(
      `Delete purchase #${purchase.entry_no}? Its products and stock are removed. ` +
        `This only works if none of its pieces have been sold.`
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      await deletePurchase(supabase, purchase.id);
      router.push("/admin/purchases");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this purchase");
      setDeleting(false);
    }
  };

  if (loading) return <p className="px-6 py-8 text-sm text-muted-foreground">Loading…</p>;

  if (!purchase) {
    return (
      <div className="px-6 py-8 text-sm">
        <p className={error ? "text-destructive" : "text-muted-foreground"}>{error ?? "Purchase not found."}</p>
        <Link href="/admin/purchases" className="mt-2 inline-block underline">
          Back to purchases
        </Link>
      </div>
    );
  }

  const mismatch =
    purchase.declared_total != null && Math.abs(purchase.declared_total - purchase.net_invoice) > 0.005;

  return (
    <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
      {justSaved ? (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Saved. {purchase.total_pieces} pieces were added to stock. Next, print the hang tags for them.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-wrap text-destructive">
          {error}
        </p>
      ) : null}

      <section className="flex flex-wrap items-start gap-4 rounded-xl border border-border bg-white p-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Purchase</p>
          <h2 className="text-xl font-semibold tracking-tight">
            #{purchase.entry_no} · {purchase.supplier_name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Entered {periodLabel(purchase.entry_date, "day")}
            {purchase.created_by_email ? ` by ${purchase.created_by_email.split("@")[0]}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            Supplier invoice: {purchase.supplier_invoice_no || "—"}
            {purchase.supplier_invoice_date ? ` · ${periodLabel(purchase.supplier_invoice_date, "day")}` : ""}
          </p>
          {purchase.supplier ? (
            <p className="text-xs text-muted-foreground">
              {[purchase.supplier.address, purchase.supplier.phone, purchase.supplier.gstin]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {purchase.notes ? <p className="mt-1 text-sm">{purchase.notes}</p> : null}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link
            href={`/admin/tags?purchase=${purchase.id}`}
            className={cn(buttonVariants(), "gap-1.5")}
          >
            <Printer className="size-4" />
            Print hang tags
          </Link>
          <Link href="/admin/purchases/new" className={buttonVariants({ variant: "outline" })}>
            New purchase
          </Link>
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border bg-white">
        <Table className="min-w-[1100px]">
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Colour</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Disc %</TableHead>
              <TableHead className="text-right">GST %</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Cost / pc</TableHead>
              <TableHead className="text-right">Profit %</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead>Barcode</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchase.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-muted-foreground">{item.line_no}</TableCell>
                <TableCell>
                  <p className="font-medium">{item.item_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[item.brand, item.design, item.hsn ? `HSN ${item.hsn}` : null].filter(Boolean).join(" · ")}
                  </p>
                </TableCell>
                <TableCell>
                  {item.department} · {item.category}
                </TableCell>
                <TableCell>{item.color}</TableCell>
                <TableCell>{item.size}</TableCell>
                <TableCell className="text-right tabular-nums">{item.qty}</TableCell>
                <TableCell className="text-right tabular-nums">{money(item.rate)}</TableCell>
                <TableCell className="text-right tabular-nums">{item.disc_percent}</TableCell>
                <TableCell className="text-right tabular-nums">{item.gst_percent}</TableCell>
                <TableCell className="text-right tabular-nums">{money(item.line_value)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(item.unit_cost)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.markup_percent == null ? "—" : item.markup_percent}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{money(item.mrp)}</TableCell>
                <TableCell className="font-mono text-xs">{item.barcode}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="ml-auto w-full max-w-sm rounded-xl border border-border bg-white p-4">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm tabular-nums">
          <dt className="text-muted-foreground">Pieces</dt>
          <dd className="text-right">{purchase.total_pieces}</dd>
          <dt className="text-muted-foreground">Value</dt>
          <dd className="text-right">{money(purchase.gross_value)}</dd>
          <dt className="text-muted-foreground">Supplier discount</dt>
          <dd className="text-right">− {money(purchase.discount_amount)}</dd>
          <dt className="text-muted-foreground">Net items</dt>
          <dd className="text-right">{money(purchase.net_items)}</dd>
          <dt className="text-muted-foreground">CGST</dt>
          <dd className="text-right">{money(purchase.cgst)}</dd>
          <dt className="text-muted-foreground">SGST</dt>
          <dd className="text-right">{money(purchase.sgst)}</dd>
          <dt className="text-muted-foreground">Round off</dt>
          <dd className="text-right">{money(purchase.round_off)}</dd>
          <dt className="border-t border-border pt-1.5 font-semibold">Net invoice</dt>
          <dd className="border-t border-border pt-1.5 text-right text-lg font-bold">
            ₹{money(purchase.net_invoice)}
          </dd>
        </dl>
        {purchase.declared_total != null ? (
          <p className={cn("mt-3 text-xs", mismatch ? "text-amber-700" : "text-emerald-700")}>
            {mismatch
              ? `The supplier's bill said ₹${money(purchase.declared_total)}. Difference ₹${money(
                  Math.abs(purchase.declared_total - purchase.net_invoice)
                )}.`
              : "Matches the supplier's bill."}
          </p>
        ) : null}
      </section>
    </div>
  );
}
