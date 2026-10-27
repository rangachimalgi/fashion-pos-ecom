import type { StaffRole } from "@/lib/staffAuth";

/**
 * Max discount (percent of MRP) per role on a POS bill line.
 *
 * UI convenience only: the database enforces the real limit
 * (public.discount_cap_percent in supabase/migrations/014). Keep both in sync.
 */
export const DISCOUNT_CAP_PERCENT: Record<StaffRole, number> = {
  admin: 100,
  manager: 5,
  staff: 2,
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
};

/** Managers and staff must send a delete request; only admins delete directly. */
export function canDeleteDirectly(role: StaffRole | null) {
  return role === "admin";
}
