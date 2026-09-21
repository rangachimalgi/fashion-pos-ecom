import { supabase } from "@/lib/supabaseClient";

export type StaffRole = "admin" | "staff";

export type StaffProfile = {
  userId: string;
  email: string | null;
  role: StaffRole;
};

function isStaffRole(value: string): value is StaffRole {
  return value === "admin" || value === "staff";
}

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

  const role = data?.role && isStaffRole(data.role) ? data.role : "staff";

  return {
    userId: user.id,
    email: user.email ?? null,
    role,
  };
}

export async function signOutStaff() {
  await supabase.auth.signOut();
}
