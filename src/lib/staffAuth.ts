import { supabase } from "@/lib/supabaseClient";

export type StaffRole = "admin" | "staff";

export type StaffProfile = {
  userId: string;
  email: string | null;
  role: StaffRole;
};

/** Signed in, but no row in public.profiles - so no staff access. */
export class NoStaffAccessError extends Error {
  constructor() {
    super(
      "This account is signed in but is not set up as staff.\n\nAsk an admin to add it to the profiles table."
    );
    this.name = "NoStaffAccessError";
  }
}

function isStaffRole(value: string): value is StaffRole {
  return value === "admin" || value === "staff";
}

/**
 * The signed-in staff member, or null when nobody is signed in.
 * Throws NoStaffAccessError for a signed-in user without a staff profile.
 *
 * This is a UI convenience only. Real enforcement is in the database (RLS +
 * is_staff()) and in server routes (requireStaff).
 */
export async function getStaffProfile(): Promise<StaffProfile | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    const extra =
      error.message.toLowerCase().includes("does not exist") ||
      error.message.toLowerCase().includes("schema cache")
        ? "\n\nRun supabase/migrations/007_staff_profiles.sql in the Supabase SQL Editor."
        : "";
    throw new Error(error.message + extra);
  }

  if (!data?.role || !isStaffRole(data.role)) throw new NoStaffAccessError();

  return {
    userId: user.id,
    email: user.email ?? null,
    role: data.role,
  };
}

export async function signOutStaff() {
  await supabase.auth.signOut();
}
