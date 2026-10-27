"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  listDeleteRequests,
  reviewDeleteRequest,
  type DeleteRequest,
  type DeleteRequestStatus,
} from "@/lib/deleteRequests";
import { formatInr, formatOrderTime, shortOrderId } from "@/lib/formatOrder";
import { ROLE_LABEL } from "@/lib/staffRoles";
import type { StaffRole } from "@/lib/staffAuth";

type Theme = "pos" | "admin";

const THEMES: Record<
  Theme,
  {
    muted: string;
    text: string;
    card: string;
    input: string;
    tabOn: string;
    tabOff: string;
    approve: string;
    reject: string;
    id: string;
  }
> = {
  pos: {
    muted: "text-slate-400",
    text: "text-slate-200",
    card: "rounded-xl border border-slate-700 bg-slate-900/60 p-4",
    input:
      "w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 font-sans text-xs text-white outline-none placeholder:text-slate-500 focus:border-emerald-400",
    tabOn: "border-emerald-400 bg-emerald-600 text-white",
    tabOff: "border-slate-600 bg-slate-900 text-slate-400",
    approve: "bg-emerald-600 text-white hover:bg-emerald-500",
    reject: "border border-slate-500 text-slate-200 hover:bg-slate-700",
    id: "font-mono text-emerald-300",
  },
  admin: {
    muted: "text-muted-foreground",
    text: "text-foreground",
    card: "rounded-xl border border-border bg-white p-4",
    input:
      "w-full rounded-lg border border-input bg-white px-3 py-2 text-xs outline-none focus:border-ring",
    tabOn: "border-foreground bg-foreground text-background",
    tabOff: "border-border bg-white text-muted-foreground",
    approve: "bg-foreground text-background hover:opacity-90",
    reject: "border border-border text-foreground hover:bg-muted",
    id: "font-mono font-semibold",
  },
};

const STATUS_STYLE: Record<DeleteRequestStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500",
  approved: "bg-emerald-500/15 text-emerald-500",
  rejected: "bg-rose-500/15 text-rose-500",
};

export function DeleteRequestsPanel({
  role,
  theme,
  onChanged,
}: {
  role: StaffRole | null;
  theme: Theme;
  /** Called after an approve / reject so the caller can refresh counts. */
  onChanged?: () => void;
}) {
  const t = THEMES[theme];
  const isAdmin = role === "admin";
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listDeleteRequests(supabase, filter === "pending" ? { status: "pending" } : undefined)
      .then((rows) => {
        if (cancelled) return;
        setRequests(rows);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load delete requests");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, reloadKey]);

  const review = async (request: DeleteRequest, approve: boolean) => {
    if (busyId) return;
    setBusyId(request.id);
    setError(null);
    try {
      await reviewDeleteRequest(supabase, request.id, approve, notes[request.id]);
      setReloadKey((key) => key + 1);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not review request");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["pending", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setLoading(true);
              setFilter(value);
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-black tracking-wider ${
              filter === value ? t.tabOn : t.tabOff
            }`}
          >
            {value === "pending" ? "PENDING" : "ALL REQUESTS"}
          </button>
        ))}
        <p className={`ml-auto font-sans text-xs ${t.muted}`}>
          {isAdmin
            ? "Approving deletes the bill and puts its stock back."
            : "An admin must approve before a bill is deleted."}
        </p>
      </div>

      {error ? <p className="mb-3 whitespace-pre-wrap font-sans text-xs text-rose-500">{error}</p> : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {loading ? (
          <p className={`font-sans text-sm ${t.muted}`}>Loading requests…</p>
        ) : requests.length === 0 ? (
          <p className={`font-sans text-sm ${t.muted}`}>
            {filter === "pending" ? "No pending delete requests." : "No delete requests yet."}
          </p>
        ) : (
          requests.map((request) => {
            const snap = request.order_snapshot;
            const billId = snap?.order_id ?? request.order_id ?? "";
            return (
              <div key={request.id} className={t.card}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={t.id}>{billId ? shortOrderId(billId) : "—"}</span>
                  <span className={`font-sans text-xs ${t.muted}`}>
                    {formatOrderTime(snap?.created_at ?? null)} · {snap?.payment_method}
                  </span>
                  <span className={`font-sans text-sm font-semibold ${t.text}`}>
                    {formatInr(Number(snap?.total_amount ?? 0))}
                  </span>
                  <span
                    className={`ml-auto rounded px-2 py-0.5 font-sans text-[10px] font-black tracking-wider uppercase ${STATUS_STYLE[request.status]}`}
                  >
                    {request.status}
                  </span>
                </div>

                {snap?.items?.length ? (
                  <ul className={`mt-2 space-y-0.5 font-sans text-xs ${t.muted}`}>
                    {snap.items.map((item, index) => (
                      <li key={index}>
                        {item.quantity} × {item.product_name ?? "Item"}
                        {item.size ? ` · ${item.size}` : ""}
                        {item.color ? ` · ${item.color}` : ""} @ {formatInr(Number(item.price_at_purchase))}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className={`mt-3 font-sans text-xs ${t.text}`}>
                  <span className={t.muted}>Reason: </span>
                  {request.reason}
                </p>
                <p className={`mt-1 font-sans text-[11px] ${t.muted}`}>
                  Requested by {request.requested_by_email?.split("@")[0] ?? "unknown"}
                  {request.requested_by_role
                    ? ` (${ROLE_LABEL[request.requested_by_role as StaffRole] ?? request.requested_by_role})`
                    : ""}{" "}
                  · {formatOrderTime(request.requested_at)}
                </p>

                {request.status !== "pending" ? (
                  <p className={`mt-1 font-sans text-[11px] ${t.muted}`}>
                    {request.status === "approved" ? "Approved" : "Rejected"} by{" "}
                    {request.reviewed_by_email?.split("@")[0] ?? "admin"} ·{" "}
                    {formatOrderTime(request.reviewed_at)}
                    {request.review_note ? ` · “${request.review_note}”` : ""}
                  </p>
                ) : null}

                {isAdmin && request.status === "pending" ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={notes[request.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                      }
                      maxLength={500}
                      placeholder="Note (optional)"
                      className={t.input}
                    />
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={!!busyId}
                        onClick={() => review(request, false)}
                        className={`rounded-lg px-3 py-2 text-xs font-black tracking-wider disabled:opacity-50 ${t.reject}`}
                      >
                        REJECT
                      </button>
                      <button
                        type="button"
                        disabled={!!busyId}
                        onClick={() => review(request, true)}
                        className={`rounded-lg px-3 py-2 text-xs font-black tracking-wider disabled:opacity-50 ${t.approve}`}
                      >
                        {busyId === request.id ? "WORKING…" : "APPROVE & DELETE"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
