"use client";

import { useEffect, useRef, useState } from "react";
import { Cake, Mail, MessageCircle, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  MESSAGE_KIND_LABEL,
  listTemplates,
  messageVars,
  openWhatsAppMessage,
  renderTemplate,
  saveTemplate,
  sendEmailMessage,
  toCustomer,
  type CustomerProfile,
  type MessageKind,
  type MessageTemplate,
} from "@/lib/messaging";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "upcoming" | "customers" | "templates" | "log";

type Occasion = {
  phone: string;
  name: string;
  email: string | null;
  marketing_opt_in: boolean;
  kind: "BIRTHDAY" | "ANNIVERSARY";
  occasion_on: string;
  days_away: number;
  sent_this_year: boolean;
};

type LogRow = {
  id: string;
  kind: MessageKind;
  channel: "WHATSAPP" | "EMAIL";
  phone: string | null;
  email: string | null;
  customer_name: string | null;
  coupon_code: string | null;
  status: "OPENED" | "SENT" | "FAILED";
  error: string | null;
  created_at: string;
};

const SAMPLE_BILL = {
  orderId: "sample",
  billNo: "2026/1/AB12",
  dateLabel: "23/11/26",
  lines: [
    { desc: "Silk Saree", qty: 1, value: 2499 },
    { desc: "Cotton Kurti", qty: 2, value: 1398 },
  ],
  total: 3897,
  saved: 433,
};

function prettyDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function whenLabel(days: number) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

/** WhatsApp + Email buttons for one customer and message kind. */
function SendButtons({
  kind,
  phone,
  name,
  email,
  optIn,
  onDone,
}: {
  kind: MessageKind;
  phone: string;
  name: string;
  email: string | null;
  optIn: boolean;
  onDone: (note: { ok: boolean; text: string }) => void;
}) {
  const [busy, setBusy] = useState<"wa" | "email" | null>(null);
  const blocked = !optIn;

  const whatsapp = async () => {
    setBusy("wa");
    try {
      const coupon = await openWhatsAppMessage(supabase, { kind, phone, name });
      onDone({ ok: true, text: `WhatsApp opened for ${name || phone}${coupon ? ` · ${coupon.code}` : ""}` });
    } catch (err) {
      onDone({ ok: false, text: errorText(err, "Could not open WhatsApp") });
    } finally {
      setBusy(null);
    }
  };

  const mail = async () => {
    setBusy("email");
    try {
      const result = await sendEmailMessage(supabase, { kind, phone, email });
      onDone({ ok: true, text: `Emailed ${result.to}${result.coupon ? ` · ${result.coupon}` : ""}` });
    } catch (err) {
      onDone({ ok: false, text: errorText(err, "Email failed") });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-1" title={blocked ? "Customer hasn't agreed to receive offers" : undefined}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={blocked || busy !== null}
        onClick={whatsapp}
        className="gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
      >
        <MessageCircle className="size-3.5" />
        {busy === "wa" ? "…" : "WhatsApp"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={blocked || !email || busy !== null}
        onClick={mail}
        title={email ? email : "No email saved"}
        className="gap-1"
      >
        <Mail className="size-3.5" />
        {busy === "email" ? "…" : "Email"}
      </Button>
    </div>
  );
}

function TemplateEditor({
  template,
  onSaved,
}: {
  template: MessageTemplate;
  onSaved: (note: { ok: boolean; text: string }) => void;
}) {
  const [draft, setDraft] = useState(template);
  const [saving, setSaving] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const textRef = useRef<HTMLTextAreaElement>(null);

  const patch = <K extends keyof MessageTemplate>(key: K, value: MessageTemplate[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const sampleCoupon = draft.coupon_enabled
    ? {
        code: draft.kind === "OFFER" && draft.offer_coupon_code ? draft.offer_coupon_code.toUpperCase() : `${draft.kind === "BILL" ? "NEXT" : draft.kind === "BIRTHDAY" ? "BDAY" : draft.kind === "ANNIVERSARY" ? "ANNIV" : "EV"}-7K3QX9`,
        description: "",
        kind: draft.coupon_kind,
        value: draft.coupon_value,
        max_discount: draft.coupon_max_discount,
        min_order: draft.coupon_min_order,
        ends_on: new Date(openedAt + draft.coupon_valid_days * 86400000).toISOString().slice(0, 10),
      }
    : null;
  const vars = messageVars({
    name: "Priya Sharma",
    bill: draft.kind === "BILL" ? SAMPLE_BILL : null,
    coupon: sampleCoupon,
  });

  const save = async () => {
    if (!draft.whatsapp_body.trim() || !draft.email_subject.trim()) {
      onSaved({ ok: false, text: "Message and email subject can't be empty." });
      return;
    }
    if (draft.coupon_enabled && !(draft.coupon_value > 0)) {
      onSaved({ ok: false, text: "Coupon value must be more than 0." });
      return;
    }
    if (draft.coupon_kind === "PERCENT" && draft.coupon_value > 100) {
      onSaved({ ok: false, text: "Percent off can't be more than 100." });
      return;
    }
    setSaving(true);
    try {
      // One message for both channels; the email drops WhatsApp *bold* stars when sent.
      await saveTemplate(supabase, { ...draft, email_body: draft.whatsapp_body });
      onSaved({ ok: true, text: `${MESSAGE_KIND_LABEL[draft.kind]} template saved.` });
    } catch (err) {
      onSaved({ ok: false, text: errorText(err, "Could not save") });
    } finally {
      setSaving(false);
    }
  };

  const insert = (token: string) => {
    const el = textRef.current;
    const body = draft.whatsapp_body;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const piece = `{${token}}`;
    patch("whatsapp_body", body.slice(0, start) + piece + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + piece.length, start + piece.length);
    });
  };

  const chips: [string, string][] = [
    ["name", "Name"],
    ...(draft.kind === "BILL"
      ? ([
          ["items", "Items"],
          ["total", "Total"],
          ["saved", "Saved"],
        ] as [string, string][])
      : []),
    ...(draft.coupon_enabled
      ? ([
          ["coupon", "Coupon code"],
          ["coupon_offer", "Offer"],
          ["coupon_expiry", "Valid till"],
        ] as [string, string][])
      : []),
  ];

  const sharedCode = draft.kind === "OFFER" && draft.offer_coupon_code !== null;

  const small = (
    key: "coupon_value" | "coupon_max_discount" | "coupon_min_order" | "coupon_valid_days",
    placeholder?: string
  ) => (
    <input
      type="number"
      min={0}
      value={draft[key] ?? ""}
      placeholder={placeholder}
      onChange={(event) =>
        patch(
          key,
          (event.target.value === "" && key === "coupon_max_discount"
            ? null
            : Number(event.target.value)) as MessageTemplate[typeof key]
        )
      }
      className="h-8 w-20 rounded-md border border-input bg-white px-2 text-center text-sm tabular-nums outline-none focus:border-ring"
    />
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-5 rounded-xl border border-border bg-white p-5">
        <div>
          <p className="text-sm font-medium">Message</p>
          <textarea
            ref={textRef}
            value={draft.whatsapp_body}
            onChange={(event) => patch("whatsapp_body", event.target.value)}
            rows={9}
            className="mt-2 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus:border-ring"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Add:</span>
            {chips.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => insert(key)}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                + {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">Email subject</p>
          <Input
            value={draft.email_subject}
            onChange={(event) => patch("email_subject", event.target.value)}
            className="mt-2 h-9"
          />
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Gift coupon</p>
              <p className="text-xs text-muted-foreground">
                {draft.kind === "BILL" ? "For their next visit" : "Sent with this message"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.coupon_enabled}
              onClick={() => patch("coupon_enabled", !draft.coupon_enabled)}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition",
                draft.coupon_enabled ? "bg-emerald-500" : "bg-slate-300"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                  draft.coupon_enabled ? "left-5.5" : "left-0.5"
                )}
              />
            </button>
          </div>

          {draft.coupon_enabled ? (
            <div className="mt-4 space-y-3">
              {draft.kind === "OFFER" ? (
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={!sharedCode}
                      onChange={() => patch("offer_coupon_code", null)}
                    />
                    New code for each customer
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={sharedCode}
                      onChange={() => patch("offer_coupon_code", draft.offer_coupon_code ?? "")}
                    />
                    Same code for everyone
                  </label>
                </div>
              ) : null}

              {sharedCode ? (
                <Input
                  value={draft.offer_coupon_code ?? ""}
                  onChange={(event) => patch("offer_coupon_code", event.target.value.toUpperCase())}
                  placeholder="e.g. DIWALI20 (from Admin → Coupons)"
                  className="h-9 max-w-xs font-mono uppercase"
                />
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted-foreground">
                  {small("coupon_value")}
                  <select
                    value={draft.coupon_kind}
                    onChange={(event) => patch("coupon_kind", event.target.value === "FLAT" ? "FLAT" : "PERCENT")}
                    className="h-8 rounded-md border border-input bg-white px-2 text-sm text-foreground"
                  >
                    <option value="PERCENT">% off</option>
                    <option value="FLAT">₹ off</option>
                  </select>
                  {draft.coupon_kind === "PERCENT" ? (
                    <>
                      <span>up to ₹</span>
                      {small("coupon_max_discount", "any")}
                    </>
                  ) : null}
                  <span>on bills above ₹</span>
                  {small("coupon_min_order")}
                  <span>· valid</span>
                  {small("coupon_valid_days")}
                  <span>days</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="lg:sticky lg:top-6">
        <p className="mb-2 text-xs text-muted-foreground">Preview</p>
        <div className="rounded-xl bg-[#e5ddd5] p-3">
          <div className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-white px-3 py-2 text-[13px] leading-snug shadow-sm">
            {renderTemplate(draft.whatsapp_body, vars)}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Email gets the same message with the coupon in a gold box.
          {draft.kind === "BILL" ? " In their birthday or anniversary month, that gift coupon is added too." : ""}
        </p>
      </div>
    </div>
  );
}

export default function AdminMessagesPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [templateKind, setTemplateKind] = useState<MessageKind>("BILL");
  const [days, setDays] = useState(7);
  const [reloadKey, setReloadKey] = useState(0);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [search, setSearch] = useState("");

  const [occasions, setOccasions] = useState<{ key: string; rows: Occasion[]; error: string | null } | null>(null);
  const [customers, setCustomers] = useState<{ key: number; rows: CustomerProfile[]; error: string | null } | null>(
    null
  );
  const [templates, setTemplates] = useState<{ key: number; rows: MessageTemplate[]; error: string | null } | null>(
    null
  );
  const [log, setLog] = useState<{ key: number; rows: LogRow[]; error: string | null } | null>(null);

  const occasionsKey = `${days}:${reloadKey}`;

  useEffect(() => {
    if (tab !== "upcoming") return;
    let cancelled = false;
    supabase
      .rpc("upcoming_occasions", { p_days: days })
      .then(({ data, error }) => {
        if (cancelled) return;
        setOccasions({
          key: occasionsKey,
          rows: ((data ?? []) as Occasion[]).map((row) => ({ ...row, days_away: Number(row.days_away) })),
          error: error ? error.message : null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [tab, days, occasionsKey]);

  useEffect(() => {
    if (tab !== "customers") return;
    let cancelled = false;
    supabase
      .from("customers")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        setCustomers({
          key: reloadKey,
          rows: ((data ?? []) as Array<Record<string, unknown>>)
            .map((row) => toCustomer(row))
            .filter((row): row is CustomerProfile => Boolean(row)),
          error: error ? error.message : null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [tab, reloadKey]);

  useEffect(() => {
    if (tab !== "templates") return;
    let cancelled = false;
    listTemplates(supabase)
      .then((rows) => {
        if (!cancelled) setTemplates({ key: reloadKey, rows, error: null });
      })
      .catch((err) => {
        if (!cancelled) setTemplates({ key: reloadKey, rows: [], error: errorText(err, "Could not load templates") });
      });
    return () => {
      cancelled = true;
    };
  }, [tab, reloadKey]);

  useEffect(() => {
    if (tab !== "log") return;
    let cancelled = false;
    supabase
      .from("message_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLog({ key: reloadKey, rows: (data ?? []) as LogRow[], error: error ? error.message : null });
      });
    return () => {
      cancelled = true;
    };
  }, [tab, reloadKey]);

  const loading =
    (tab === "upcoming" && occasions?.key !== occasionsKey) ||
    (tab === "customers" && customers?.key !== reloadKey) ||
    (tab === "templates" && templates?.key !== reloadKey) ||
    (tab === "log" && log?.key !== reloadKey);

  const loadError =
    tab === "upcoming"
      ? occasions?.error
      : tab === "customers"
        ? customers?.error
        : tab === "templates"
          ? templates?.error
          : log?.error;

  const query = search.trim().toLowerCase();
  const shownCustomers = (customers?.rows ?? []).filter(
    (row) =>
      !query ||
      row.name.toLowerCase().includes(query) ||
      row.phone.includes(query) ||
      (row.email ?? "").toLowerCase().includes(query)
  );

  const afterSend = (next: { ok: boolean; text: string }) => {
    setNote(next);
    if (next.ok) setReloadKey((key) => key + 1);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 md:px-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Messages</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bills, birthday / anniversary wishes and offers on WhatsApp and email. WhatsApp opens a ready-made chat —
          press Send in WhatsApp. Each wish or bill can carry a one-time coupon for the customer&apos;s next visit.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          {(
            [
              ["upcoming", "Birthdays & anniversaries"],
              ["customers", "Customers"],
              ["templates", "Templates"],
              ["log", "Sent"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setNote(null);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium",
                tab === id ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={() => setReloadKey((key) => key + 1)}
          disabled={loading}
          aria-label="Refresh"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </div>

      {note ? (
        <p
          className={cn(
            "rounded-xl border px-3 py-2 text-sm",
            note.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-800"
          )}
        >
          {note.text}
        </p>
      ) : null}
      {loadError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {/could not find|does not exist|schema cache/i.test(loadError)
            ? "Run supabase/migrations/037_customers_messaging.sql in the Supabase SQL Editor first."
            : loadError}
        </p>
      ) : null}

      {tab === "upcoming" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="text-sm font-medium">Coming up</p>
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs"
            >
              <option value={0}>Today</option>
              <option value={7}>Next 7 days</option>
              <option value={30}>Next 30 days</option>
            </select>
          </div>
          {loading ? (
            <div className="px-5 py-8">
              <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
            </div>
          ) : (occasions?.rows ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
              <Cake className="size-6 stroke-[1.5]" />
              No birthdays or anniversaries in this period. Add them at the POS (customer → “Add email, birthday…”).
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(occasions?.rows ?? []).map((row) => (
                <li key={`${row.kind}-${row.phone}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {row.name || row.phone}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {row.kind === "BIRTHDAY" ? "🎂 Birthday" : "💐 Anniversary"} · {prettyDate(row.occasion_on)} ·{" "}
                        {whenLabel(row.days_away)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      +91 {row.phone}
                      {row.email ? ` · ${row.email}` : ""}
                      {row.sent_this_year ? (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Sent</span>
                      ) : null}
                      {!row.marketing_opt_in ? (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5">No consent for offers</span>
                      ) : null}
                    </p>
                  </div>
                  <SendButtons
                    kind={row.kind}
                    phone={row.phone}
                    name={row.name}
                    email={row.email}
                    optIn={row.marketing_opt_in}
                    onDone={afterSend}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "customers" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, mobile or email"
                className="h-9 pl-8"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {shownCustomers.length} customers · {shownCustomers.filter((row) => row.marketing_opt_in).length} agreed
              to offers · send the Offer template
            </p>
          </div>
          {loading ? (
            <div className="px-5 py-8">
              <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
            </div>
          ) : shownCustomers.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              No customers yet. They are saved when a POS bill or online order is placed.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {shownCustomers.map((row) => (
                <li key={row.phone} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{row.name || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      +91 {row.phone}
                      {row.email ? ` · ${row.email}` : ""}
                      {row.birthday ? ` · 🎂 ${prettyDate(row.birthday)}` : ""}
                      {row.anniversary ? ` · 💐 ${prettyDate(row.anniversary)}` : ""}
                    </p>
                  </div>
                  {row.marketing_opt_in ? (
                    <SendButtons
                      kind="OFFER"
                      phone={row.phone}
                      name={row.name}
                      email={row.email}
                      optIn
                      onDone={afterSend}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">No consent for offers</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "templates" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(templates?.rows ?? []).map((template) => (
              <button
                key={template.kind}
                type="button"
                onClick={() => setTemplateKind(template.kind)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm",
                  templateKind === template.kind
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-white text-muted-foreground hover:text-foreground"
                )}
              >
                {MESSAGE_KIND_LABEL[template.kind]}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-white" />
          ) : (
            (templates?.rows ?? [])
              .filter((template) => template.kind === templateKind)
              .map((template) => <TemplateEditor key={template.kind} template={template} onSaved={setNote} />)
          )}
        </div>
      ) : null}

      {tab === "log" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          {loading ? (
            <div className="px-5 py-8">
              <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
            </div>
          ) : (log?.rows ?? []).length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nothing sent yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(log?.rows ?? []).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                  <span className="w-32 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="w-24 shrink-0 text-xs">
                    {row.channel === "WHATSAPP" ? "WhatsApp" : "Email"} · {MESSAGE_KIND_LABEL[row.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {row.customer_name || "—"}{" "}
                    <span className="text-xs text-muted-foreground">
                      {row.channel === "EMAIL" ? row.email : row.phone ? `+91 ${row.phone}` : ""}
                    </span>
                  </span>
                  {row.coupon_code ? <code className="text-xs">{row.coupon_code}</code> : null}
                  <span
                    title={row.error ?? undefined}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      row.status === "SENT"
                        ? "bg-emerald-50 text-emerald-700"
                        : row.status === "OPENED"
                          ? "bg-sky-50 text-sky-700"
                          : "bg-rose-50 text-rose-700"
                    )}
                  >
                    {row.status === "OPENED" ? "Chat opened" : row.status === "SENT" ? "Sent" : "Failed"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
