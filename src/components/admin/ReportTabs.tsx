import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/reports", label: "Sales & profit", id: "sales" },
  { href: "/admin/reports/margin", label: "Item margin", id: "margin" },
  { href: "/admin/reports/purchases", label: "Purchases", id: "purchases" },
] as const;

export function ReportTabs({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
            tab.id === active
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
