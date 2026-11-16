import type { SupabaseClient } from "@supabase/supabase-js";
import { STORE_RECEIPT } from "@/lib/storeReceipt";

export const DEFAULT_RECEIPT_TERMS = [...STORE_RECEIPT.terms];

function missingMigrationHint(message: string) {
  const lower = message.toLowerCase();
  if (
    lower.includes("could not find") ||
    lower.includes("get_receipt_terms") ||
    lower.includes("set_receipt_terms") ||
    lower.includes("receipt_settings")
  ) {
    return "Run supabase/migrations/033_receipt_terms.sql in the Supabase SQL Editor first.";
  }
  return null;
}

function friendly(error: { message: string }) {
  return new Error(missingMigrationHint(error.message) ?? error.message);
}

/** Normalize a pasted / typed list into clean receipt lines. */
export function normalizeReceiptTerms(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, 160));
    if (out.length >= 20) break;
  }
  return out;
}

export function validateReceiptTerms(lines: string[]): string | null {
  const cleaned = normalizeReceiptTerms(lines);
  if (cleaned.length > 20) return "Keep receipt terms to 20 lines or fewer.";
  if (cleaned.some((line) => line.length > 160)) {
    return "Each term must be 160 characters or fewer.";
  }
  return null;
}

/** Any staff can read — POS uses this when printing. */
export async function getReceiptTerms(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_receipt_terms");
  if (error) throw friendly(error);
  if (!Array.isArray(data)) return DEFAULT_RECEIPT_TERMS;
  return normalizeReceiptTerms(data.map((line) => String(line ?? "")));
}

/** Admin only. */
export async function setReceiptTerms(
  supabase: SupabaseClient,
  lines: string[]
): Promise<string[]> {
  const cleaned = normalizeReceiptTerms(lines);
  const problem = validateReceiptTerms(cleaned);
  if (problem) throw new Error(problem);

  const { data, error } = await supabase.rpc("set_receipt_terms", {
    p_terms: cleaned,
  });
  if (error) throw friendly(error);
  if (!Array.isArray(data)) return cleaned;
  return normalizeReceiptTerms(data.map((line) => String(line ?? "")));
}
