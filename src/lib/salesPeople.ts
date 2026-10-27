import type { SupabaseClient } from "@supabase/supabase-js";
import { toCheckoutError } from "@/lib/placeOrder";

export type SalesPerson = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
};

export type SalesRow = {
  /** null for the "Unassigned" row (bills with no salesperson). */
  sales_person_id: string | null;
  name: string;
  active: boolean;
  bills: number;
  pieces: number;
  total_amount: number;
};

function friendly(error: { code?: string; message: string }): Error {
  switch (error.code) {
    case "23505":
      return new Error("That name is already on the list.");
    case "23514":
      return new Error("A name needs 2 to 60 characters.");
    case "23503":
      return new Error("This person has bills on record. Deactivate them instead of deleting.");
    case "42501":
      return new Error("Only an admin can change the sales team.");
    default:
      return toCheckoutError(error);
  }
}

export async function listSalesPeople(supabase: SupabaseClient): Promise<SalesPerson[]> {
  const { data, error } = await supabase
    .from("sales_people")
    .select("id, name, active, created_at")
    .order("name", { ascending: true });
  if (error) throw friendly(error);
  return (data ?? []) as SalesPerson[];
}

export async function addSalesPerson(supabase: SupabaseClient, name: string) {
  const { error } = await supabase.from("sales_people").insert({ name: name.trim() });
  if (error) throw friendly(error);
}

export async function renameSalesPerson(supabase: SupabaseClient, id: string, name: string) {
  const { data, error } = await supabase
    .from("sales_people")
    .update({ name: name.trim() })
    .eq("id", id)
    .select("id");
  if (error) throw friendly(error);
  if (!data?.length) throw friendly({ code: "42501", message: "not allowed" });
}

export async function setSalesPersonActive(supabase: SupabaseClient, id: string, active: boolean) {
  const { data, error } = await supabase
    .from("sales_people")
    .update({ active })
    .eq("id", id)
    .select("id");
  if (error) throw friendly(error);
  if (!data?.length) throw friendly({ code: "42501", message: "not allowed" });
}

export async function deleteSalesPerson(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("sales_people").delete().eq("id", id).select("id");
  if (error) throw friendly(error);
  if (!data?.length) throw friendly({ code: "42501", message: "not allowed" });
}

/** Admin only. `from` is inclusive, `to` exclusive; both optional (= all time). */
export async function salesByPerson(
  supabase: SupabaseClient,
  range?: { from?: string; to?: string }
): Promise<SalesRow[]> {
  const { data, error } = await supabase.rpc("sales_by_person", {
    p_from: range?.from ?? null,
    p_to: range?.to ?? null,
  });
  if (error) throw toCheckoutError(error);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    sales_person_id: (row.sales_person_id as string | null) ?? null,
    name: String(row.name),
    active: Boolean(row.active),
    bills: Number(row.bills),
    pieces: Number(row.pieces),
    total_amount: Number(row.total_amount),
  }));
}
