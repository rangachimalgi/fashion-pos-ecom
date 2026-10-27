import type { SupabaseClient } from "@supabase/supabase-js";
import { toCheckoutError } from "@/lib/placeOrder";

/** How many of each note/coin, keyed by denomination: { "500": 2, "20": 1 }. */
export type CashCounts = Record<string, number>;

/** Used until the list is loaded from the database (public.cash_drawer). */
export const DEFAULT_DENOMINATIONS = [500, 100, 50, 20, 10, 5, 2, 1];

export function cashValue(counts: CashCounts): number {
  return Object.entries(counts).reduce(
    (sum, [denomination, count]) => sum + Number(denomination) * (Number(count) || 0),
    0
  );
}

/** Drops zero / invalid entries so only real notes and coins are sent. */
export function cleanCounts(counts: CashCounts): CashCounts {
  const out: CashCounts = {};
  for (const [denomination, count] of Object.entries(counts)) {
    const n = Math.floor(Number(count));
    if (Number.isFinite(n) && n > 0) out[denomination] = n;
  }
  return out;
}

/** Fewest notes/coins that make `amount` (whole rupees). */
export function greedyCounts(amount: number, denominations: number[]): CashCounts {
  const out: CashCounts = {};
  let left = Math.max(0, Math.round(amount));
  for (const denomination of [...denominations].sort((a, b) => b - a)) {
    const n = Math.floor(left / denomination);
    if (n > 0) {
      out[String(denomination)] = n;
      left -= n * denomination;
    }
  }
  return out;
}

/** Bill total rounded to the whole rupee that cash can actually pay. */
export function cashDueFor(total: number): number {
  return Math.round(Math.round(total * 100) / 100);
}

export async function listCashDenominations(supabase: SupabaseClient): Promise<number[]> {
  const { data, error } = await supabase.rpc("cash_denominations");
  if (error) throw toCheckoutError(error);
  const list = ((data ?? []) as Array<{ denomination: number }>).map((row) => Number(row.denomination));
  return list.length ? list.sort((a, b) => b - a) : DEFAULT_DENOMINATIONS;
}

// ---------------------------------------------------------------------------
// Admin only (the database refuses everyone else)
// ---------------------------------------------------------------------------

export type DrawerRow = { denomination: number; quantity: number };

export type CashEntry = {
  id: string;
  created_at: string;
  kind: "bill" | "bill_undo" | "adjustment";
  order_ref: string | null;
  delta: CashCounts;
  amount: number;
  note: string | null;
  actor_email: string | null;
};

export async function fetchDrawer(supabase: SupabaseClient): Promise<DrawerRow[]> {
  const { data, error } = await supabase
    .from("cash_drawer")
    .select("denomination, quantity")
    .order("denomination", { ascending: false });
  if (error) throw toCheckoutError(error);
  return ((data ?? []) as DrawerRow[]).map((row) => ({
    denomination: Number(row.denomination),
    quantity: Number(row.quantity),
  }));
}

/** How many recent movements the cash panel shows. */
export const RECENT_MOVEMENTS_LIMIT = 20;

export async function fetchCashHistory(
  supabase: SupabaseClient,
  limit = RECENT_MOVEMENTS_LIMIT
): Promise<CashEntry[]> {
  const { data, error } = await supabase
    .from("cash_ledger_entries")
    .select("id, created_at, kind, order_ref, delta, amount, note, actor_email")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw toCheckoutError(error);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    created_at: String(row.created_at),
    kind: row.kind as CashEntry["kind"],
    order_ref: (row.order_ref as string | null) ?? null,
    delta: (row.delta as CashCounts) ?? {},
    amount: Number(row.amount),
    note: (row.note as string | null) ?? null,
    actor_email: (row.actor_email as string | null) ?? null,
  }));
}

/** Sets the counter to what was physically counted. Only changed rows are sent. */
export async function setCashDrawer(
  supabase: SupabaseClient,
  counts: Record<string, number>,
  note: string
) {
  const { error } = await supabase.rpc("set_cash_drawer", { p_counts: counts, p_note: note.trim() });
  if (error) {
    if (error.code === "PGRST202") {
      throw new Error("The cash ledger is not set up yet. Run supabase/migrations/018_petty_cash_ledger.sql.");
    }
    throw toCheckoutError(error);
  }
}
