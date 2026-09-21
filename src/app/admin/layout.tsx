import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { StaffGate } from "@/components/auth/StaffGate";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <StaffGate allow={["admin"]}>
      <AdminShell>{children}</AdminShell>
    </StaffGate>
  );
}
