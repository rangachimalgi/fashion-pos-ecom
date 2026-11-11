import type { SupabaseClient } from "@supabase/supabase-js";
import { toCheckoutError } from "@/lib/placeOrder";

/** Used when an admin sets a salary and does not type a percentage. */
export const DEFAULT_TARGET_PERCENT = 1500;
/** Incentive on sales above the target, as a % of the extra amount. */
export const DEFAULT_INCENTIVE_PERCENT = 1;

export type TargetRow = {
  sales_person_id: string;
  name: string;
  active: boolean;
  /** null until the admin enters a salary. */
  monthly_salary: number | null;
  target_percent: number | null;
  /** salary x percent / 100, null when no salary is set. */
  target_amount: number | null;
  achieved: number;
  bills: number;
  /** % of the sales above target paid as incentive. */
  incentive_percent: number | null;
  /** (achieved - target, never below 0) x incentive % / 100; null when no target. */
  incentive_amount: number | null;
};

/** Same maths as the database: salary x percent / 100, rounded to paise. */
export function targetFor(salary: number, percent: number): number {
  return Math.round(salary * percent) / 100;
}

/** Incentive on the part of sales above the target (Rs 100 extra at 1% = Rs 1). */
export function incentiveFor(target: number, achieved: number, percent: number): number {
  return Math.round(Math.max(achieved - target, 0) * percent) / 100;
}

export function targetProgress(row: Pick<TargetRow, "target_amount" | "achieved">) {
  const target = row.target_amount ?? 0;
  const percent = target > 0 ? (row.achieved / target) * 100 : 0;
  return {
    percent,
    remaining: Math.max(target - row.achieved, 0),
    over: Math.max(row.achieved - target, 0),
    reached: target > 0 && row.achieved >= target,
  };
}

function friendly(error: { code?: string; message: string }): Error {
  switch (error.code) {
    case "PGRST202":
      return new Error("Run supabase/migrations/026_sales_targets.sql in the Supabase SQL Editor first.");
    case "42P01":
      return new Error("Run supabase/migrations/026_sales_targets.sql in the Supabase SQL Editor first.");
    case "42703":
    case "PGRST204":
      return new Error("Run supabase/migrations/027_incentives_employee_target.sql in the Supabase SQL Editor first.");
    case "23514":
      return new Error("Salary must be 0 to 1,00,00,000, the target % 0 to 100000 and the incentive % 0 to 100.");
    case "42501":
      return new Error("Only an admin can change targets.");
    default:
      return toCheckoutError(error);
  }
}

/** Admin only. `month` is YYYY-MM, read in shop time (Asia/Kolkata). */
export async function fetchTargetProgress(supabase: SupabaseClient, month: string): Promise<TargetRow[]> {
  const { data, error } = await supabase.rpc("sales_target_progress", { p_month: `${month}-01` });
  if (error) throw friendly(error);
  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    sales_person_id: String(row.sales_person_id),
    name: String(row.name),
    active: Boolean(row.active),
    monthly_salary: num(row.monthly_salary),
    target_percent: num(row.target_percent),
    target_amount: num(row.target_amount),
    achieved: Number(row.achieved),
    bills: Number(row.bills),
    incentive_percent: num(row.incentive_percent),
    incentive_amount: num(row.incentive_amount),
  }));
}

export async function saveTarget(
  supabase: SupabaseClient,
  salesPersonId: string,
  salary: number,
  percent: number,
  incentivePercent: number
) {
  const { error } = await supabase.from("sales_targets").upsert(
    {
      sales_person_id: salesPersonId,
      monthly_salary: salary,
      target_percent: percent,
      incentive_percent: incentivePercent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "sales_person_id" }
  );
  if (error) throw friendly(error);
}

export async function clearTarget(supabase: SupabaseClient, salesPersonId: string) {
  const { error } = await supabase.from("sales_targets").delete().eq("sales_person_id", salesPersonId);
  if (error) throw friendly(error);
}

export type MyTarget = {
  /** false until the admin links this login to a salesperson name. */
  linked: boolean;
  monthly_salary: number | null;
  target_percent: number | null;
  target_amount: number | null;
  achieved: number;
  bills: number;
  incentive_percent: number | null;
  incentive_amount: number | null;
};

/** The signed-in employee's own figures. `month` is YYYY-MM (shop time). */
export async function fetchMyTarget(supabase: SupabaseClient, month: string): Promise<MyTarget> {
  const { data, error } = await supabase.rpc("my_target_progress", { p_month: `${month}-01` });
  if (error) {
    if (error.code === "PGRST202") {
      throw new Error("Targets are not set up yet. Ask the admin to run migration 027.");
    }
    throw new Error(error.message);
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Could not load your target.");
  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    linked: Boolean(row.linked),
    monthly_salary: num(row.monthly_salary),
    target_percent: num(row.target_percent),
    target_amount: num(row.target_amount),
    achieved: Number(row.achieved),
    bills: Number(row.bills),
    incentive_percent: num(row.incentive_percent),
    incentive_amount: num(row.incentive_amount),
  };
}

// ---------------------------------------------------------------------------
// Performance colour (migration 029)
//   green  met the target in the last finished month
//   yellow missed it 1 month
//   red    missed it 2 months in a row
//   none   no target yet, or no full month to judge
// ---------------------------------------------------------------------------

export type Standing = "green" | "yellow" | "red" | "none";

export type Performance = {
  standing: Standing;
  missed_streak: number;
  /** First day (YYYY-MM-DD) of the last finished month that was judged. */
  judged_month: string;
  last_result: "met" | "missed" | "skip";
  previous_result: "met" | "missed" | "skip";
};

function toPerformance(row: Record<string, unknown>): Performance {
  const standing = String(row.standing);
  const result = (value: unknown) => (value === "met" || value === "missed" ? value : "skip");
  return {
    standing: standing === "green" || standing === "yellow" || standing === "red" ? standing : "none",
    missed_streak: Number(row.missed_streak ?? 0),
    judged_month: String(row.judged_month),
    last_result: result(row.last_result),
    previous_result: result(row.previous_result),
  };
}

/**
 * Admin: colour for every salesperson with a target, keyed by sales person id.
 * Returns null when migration 029 has not been run yet (the page still works).
 */
export async function fetchPerformance(
  supabase: SupabaseClient,
  month: string
): Promise<Map<string, Performance> | null> {
  const { data, error } = await supabase.rpc("sales_performance", { p_month: `${month}-01` });
  if (error) {
    if (error.code === "PGRST202") return null;
    throw new Error(error.message);
  }
  const out = new Map<string, Performance>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    out.set(String(row.sales_person_id), toPerformance(row));
  }
  return out;
}

/** The signed-in employee's own colour; null when migration 029 is missing. */
export async function fetchMyPerformance(supabase: SupabaseClient, month: string): Promise<Performance | null> {
  const { data, error } = await supabase.rpc("my_performance", { p_month: `${month}-01` });
  if (error) {
    if (error.code === "PGRST202") return null;
    throw new Error(error.message);
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  return row ? toPerformance(row) : null;
}
