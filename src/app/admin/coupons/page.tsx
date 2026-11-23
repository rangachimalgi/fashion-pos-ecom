"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, RefreshCw, TicketPercent, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  CHANNEL_LABEL,
  createCoupon,
  deleteCoupon,
  describeCoupon,
  listCoupons,
  normalizeCouponCode,
  setCouponActive,
  updateCoupon,
  validateCouponInput,
  type Coupon,
  type CouponChannel,
  type CouponInput,
  type CouponKind,
  type CouponStats,
} from "@/lib/coupons";
import { formatInr } from "@/lib/formatOrder";
import { todayInShop } from "@/lib/salesReport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Row = { coupon: Coupon; stats: CouponStats };

type Draft = {
  code: string;
  description: string;
  kind: CouponKind;
  value: string;
  max_discount: string;
  min_order: string;
  starts_on: string;
  ends_on: string;
  usage_limit: string;
  per_customer_limit: string;
  channel: CouponChannel;
  active: boolean;
};

const EMPTY_DRAFT: Draft = {
  code: "",
  description: "",
  kind: "PERCENT",
  value: "10",
  max_discount: "",
  min_order: "",
  starts_on: "",
  ends_on: "",
  usage_limit: "",
  per_customer_limit: "1",
  channel: "ALL",
  active: true,
};

function draftFrom(coupon: Coupon): Draft {
  const text = (value: number | string | null) => (value == null ? "" : String(value));
  return {
    code: coupon.code,
    description: coupon.description,
    kind: coupon.kind,
    value: text(coupon.value),
    max_discount: text(coupon.max_discount),
    min_order: coupon.min_order > 0 ? String(coupon.min_order) : "",
    starts_on: coupon.starts_on ?? "",
    ends_on: coupon.ends_on ?? "",
    usage_limit: text(coupon.usage_limit),
    per_customer_limit: text(coupon.per_customer_limit),
    channel: coupon.channel,
    active: coupon.active,
  };
}

function inputFrom(draft: Draft): CouponInput {
  const optional = (value: string) => (value.trim() === "" ? null : Number(value));
  return {
    code: normalizeCouponCode(draft.code),
    description: draft.description,
    kind: draft.kind,
    value: Number(draft.value),
    max_discount: draft.kind === "PERCENT" ? optional(draft.max_discount) : null,
    min_order: Number(draft.min_order || 0),
    starts_on: draft.starts_on || null,
    ends_on: draft.ends_on || null,
    usage_limit: optional(draft.usage_limit),
    per_customer_limit: optional(draft.per_customer_limit),
    channel: draft.channel,
    active: draft.active,
  };
}

function dateLabel(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusOf(row: Row, today: string): { label: string; tone: string } {
  const { coupon, stats } = row;
  if (!coupon.active) return { label: "Off", tone: "bg-slate-100 text-slate-500" };
  if (coupon.ends_on && today > coupon.ends_on) return { label: "Expired", tone: "bg-slate-100 text-slate-500" };
  if (coupon.starts_on && today < coupon.starts_on) return { label: "Scheduled", tone: "bg-sky-50 text-sky-700" };
  if (coupon.usage_limit != null && stats.uses >= coupon.usage_limit) {
    return { label: "Used up", tone: "bg-amber-50 text-amber-700" };
  }
  return { label: "Live", tone: "bg-emerald-50 text-emerald-700" };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{hint}</span> : null}
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium",
            value === option.id ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function AdminCouponsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<{ key: number; rows: Row[]; error: string | null } | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCoupons(supabase)
      .then((rows) => {
        if (!cancelled) setLoaded({ key: reloadKey, rows, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setLoaded({
            key: reloadKey,
            rows: [],
            error: err instanceof Error ? err.message : "Could not load coupons",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const loading = loaded?.key !== reloadKey;
  const rows = loaded?.rows ?? [];
  const today = todayInShop();
  const totals = rows.reduce(
    (sum, row) => ({ uses: sum.uses + row.stats.uses, discount: sum.discount + row.stats.discount_total }),
    { uses: 0, discount: 0 }
  );

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setEditing((current) => (current ? { ...current, draft: { ...current.draft, [key]: value } } : current));
    setFormError(null);
  };

  const save = async () => {
    if (!editing) return;
    const input = inputFrom(editing.draft);
    const problem = validateCouponInput(input);
    if (problem) {
      setFormError(problem);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing.id) await updateCoupon(supabase, editing.id, input);
      else await createCoupon(supabase, input);
      setEditing(null);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the coupon");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (coupon: Coupon) => {
    setBusyId(coupon.id);
    setActionError(null);
    try {
      await setCouponActive(supabase, coupon.id, !coupon.active);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update the coupon");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: Row) => {
    const note =
      row.stats.uses > 0
        ? `\n\nIt was used on ${row.stats.uses} bill(s). Those bills keep the code and discount.`
        : "";
    if (!window.confirm(`Delete coupon ${row.coupon.code}?${note}`)) return;
    setBusyId(row.coupon.id);
    setActionError(null);
    try {
      await deleteCoupon(supabase, row.coupon.id);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete the coupon");
    } finally {
      setBusyId(null);
    }
  };

  const draft = editing?.draft;
  const preview = draft ? inputFrom(draft) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Coupons</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Codes customers can use in the online bag or at the POS counter. At the POS, a coupon replaces the manual
            discount (items go back to MRP, then the coupon applies).
          </p>
        </div>
        {!editing ? (
          <Button
            type="button"
            onClick={() => {
              setEditing({ id: null, draft: { ...EMPTY_DRAFT } });
              setFormError(null);
            }}
          >
            <Plus className="size-4" /> New coupon
          </Button>
        ) : null}
      </div>

      {loaded?.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{loaded.error}</p>
      ) : null}
      {actionError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{actionError}</p>
      ) : null}

      {editing && draft && preview ? (
        <div className="rounded-xl border border-border bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{editing.id ? `Edit ${editing.draft.code}` : "New coupon"}</p>
            {preview.value > 0 ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                {describeCoupon(preview)}
              </span>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" hint="Customers type this. Letters, numbers, - or _.">
              <Input
                value={draft.code}
                onChange={(event) => patch("code", normalizeCouponCode(event.target.value))}
                placeholder="DIWALI20"
                className="h-9 font-mono uppercase tracking-wider"
              />
            </Field>
            <Field label="Description (optional)" hint="Shown to the customer when the code is applied.">
              <Input
                value={draft.description}
                maxLength={80}
                onChange={(event) => patch("description", event.target.value)}
                placeholder="Diwali offer: 20% off"
                className="h-9"
              />
            </Field>

            <Field label="Discount type">
              <Segmented
                value={draft.kind}
                onChange={(kind) => patch("kind", kind)}
                options={[
                  { id: "PERCENT", label: "% off" },
                  { id: "FLAT", label: "₹ off" },
                ]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={draft.kind === "PERCENT" ? "Percent off" : "Amount off (₹)"}>
                <Input
                  type="number"
                  min={1}
                  max={draft.kind === "PERCENT" ? 100 : undefined}
                  value={draft.value}
                  onChange={(event) => patch("value", event.target.value)}
                  className="h-9"
                />
              </Field>
              {draft.kind === "PERCENT" ? (
                <Field label="Max off (₹)" hint="Blank = no cap">
                  <Input
                    type="number"
                    min={1}
                    value={draft.max_discount}
                    onChange={(event) => patch("max_discount", event.target.value)}
                    className="h-9"
                  />
                </Field>
              ) : null}
            </div>

            <Field label="Minimum bill (₹)" hint="Blank = any amount">
              <Input
                type="number"
                min={0}
                value={draft.min_order}
                onChange={(event) => patch("min_order", event.target.value)}
                className="h-9"
              />
            </Field>
            <Field label="Where it works">
              <Segmented
                value={draft.channel}
                onChange={(channel) => patch("channel", channel)}
                options={[
                  { id: "ALL", label: "Both" },
                  { id: "ONLINE", label: "Online" },
                  { id: "POS", label: "Store" },
                ]}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts on" hint="Blank = now">
                <Input
                  type="date"
                  value={draft.starts_on}
                  onChange={(event) => patch("starts_on", event.target.value)}
                  className="h-9"
                />
              </Field>
              <Field label="Ends on" hint="Blank = never">
                <Input
                  type="date"
                  value={draft.ends_on}
                  min={draft.starts_on || undefined}
                  onChange={(event) => patch("ends_on", event.target.value)}
                  className="h-9"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total uses" hint="Blank = unlimited">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={draft.usage_limit}
                  onChange={(event) => patch("usage_limit", event.target.value)}
                  className="h-9"
                />
              </Field>
              <Field label="Uses per customer" hint="By mobile no. Blank = unlimited">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={draft.per_customer_limit}
                  onChange={(event) => patch("per_customer_limit", event.target.value)}
                  className="h-9"
                />
              </Field>
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.active} onChange={(event) => patch("active", event.target.checked)} />
            Active (customers can use it)
          </label>

          {formError ? <p className="mt-3 text-sm text-rose-600">{formError}</p> : null}

          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing.id ? "Save changes" : "Create coupon"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-muted-foreground">Coupons</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-muted-foreground">Times used</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{totals.uses}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="text-xs text-muted-foreground">Total discount given</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatInr(totals.discount)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-medium">All coupons</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
        </div>
        {loading ? (
          <div className="px-5 py-8">
            <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
            <TicketPercent className="size-6 stroke-[1.5]" />
            No coupons yet. Create one to share with customers.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const { coupon, stats } = row;
              const status = statusOf(row, today);
              const limits = [
                CHANNEL_LABEL[coupon.channel],
                coupon.starts_on || coupon.ends_on
                  ? `${coupon.starts_on ? dateLabel(coupon.starts_on) : "Now"} – ${
                      coupon.ends_on ? dateLabel(coupon.ends_on) : "no end"
                    }`
                  : null,
                coupon.per_customer_limit != null ? `${coupon.per_customer_limit}× per customer` : null,
              ].filter(Boolean);
              return (
                <li key={coupon.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-dashed border-border px-2 py-0.5 font-mono text-sm font-semibold tracking-wider">
                        {coupon.code}
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", status.tone)}>
                        {status.label}
                      </span>
                      <span className="text-sm">{describeCoupon(coupon)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {coupon.description ? `${coupon.description} · ` : ""}
                      {limits.join(" · ")}
                    </p>
                  </div>
                  <div className="text-right text-xs tabular-nums">
                    <p className="font-medium">
                      {stats.uses}
                      {coupon.usage_limit != null ? ` / ${coupon.usage_limit}` : ""} used
                    </p>
                    <p className="text-muted-foreground">{formatInr(stats.discount_total)} off</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggle(coupon)}
                      disabled={busyId === coupon.id}
                    >
                      {coupon.active ? "Turn off" : "Turn on"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing({ id: coupon.id, draft: draftFrom(coupon) });
                        setFormError(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      aria-label="Edit"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(row)}
                      disabled={busyId === coupon.id}
                      aria-label="Delete"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
