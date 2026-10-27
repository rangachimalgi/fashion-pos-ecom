import type { ReactNode } from "react";
import { StaffGate } from "@/components/auth/StaffGate";

export default function BillingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <StaffGate allow={["admin", "manager", "staff"]}>{children}</StaffGate>;
}
