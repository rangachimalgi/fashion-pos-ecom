"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOutStaff } from "@/lib/staffAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SignOutButton({
  className,
  variant = "ghost",
}: {
  className?: string;
  variant?: "ghost" | "outline";
}) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={cn("justify-start gap-2", className)}
      onClick={async () => {
        await signOutStaff();
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
