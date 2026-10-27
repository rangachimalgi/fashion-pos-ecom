import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { StaffRole } from "@/lib/staffAuth";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Verifies the caller on the server and checks their staff role.
 *
 * Accepts either `Authorization: Bearer <supabase access token>` (mobile app,
 * scripts) or the Supabase session cookie (web). The token is validated with
 * Supabase Auth (`getUser`), never just decoded, and the role comes from
 * `public.profiles` - not from anything the client sends.
 */
export async function requireStaff(
  request: Request,
  roles: StaffRole[] = ["admin", "staff"]
): Promise<{ userId: string; role: StaffRole }> {
  const admin = getSupabaseAdmin();
  let userId: string | undefined;

  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const { data, error } = await admin.auth.getUser(header.slice(7).trim());
    if (!error) userId = data.user?.id;
  } else {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {
            /* read-only: this helper never refreshes the session */
          },
        },
      }
    );
    const { data, error } = await supabase.auth.getUser();
    if (!error) userId = data.user?.id;
  }

  if (!userId) throw new AuthError("Sign in required", 401);

  const { data: profile, error } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!profile || !roles.includes(profile.role as StaffRole)) {
    throw new AuthError("You do not have access to this", 403);
  }

  return { userId, role: profile.role as StaffRole };
}
