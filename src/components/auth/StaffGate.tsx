"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getStaffProfile, type StaffRole } from "@/lib/staffAuth";

type StaffGateProps = {
  allow: StaffRole[];
  children: ReactNode;
};

export function StaffGate({ allow, children }: StaffGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowKey = allow.join(",");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const profile = await getStaffProfile();
        if (cancelled) return;

        if (!profile) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }

        if (!allowKey.split(",").includes(profile.role)) {
          router.replace(profile.role === "staff" ? "/billing" : "/admin");
          return;
        }

        setAllowed(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not check access");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [allowKey, pathname, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-6">
        <p className="max-w-md whitespace-pre-wrap text-center text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  return children;
}
