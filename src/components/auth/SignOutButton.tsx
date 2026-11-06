"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOutStaff } from "@/lib/staffAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SignOutButton({
  className,
  labelClassName,
  variant = "ghost",
}: {
  className?: string;
  /** Lets the sidebar hide the text while it is collapsed. */
  labelClassName?: string;
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
      <LogOut className="size-4 shrink-0" />
      <span className={labelClassName}>Sign out</span>
    </Button>
  );
}
