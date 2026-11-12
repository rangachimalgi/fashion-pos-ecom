"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Barcode, ChartColumn, ClipboardList, FileSpreadsheet, LayoutGrid, Menu, MonitorSmartphone, Receipt, Tags, Trash2, Users } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { countPendingDeleteRequests } from "@/lib/deleteRequests";
import { countPendingLeaves } from "@/lib/attendance";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
  badge?: "deletes" | "leaves";
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin",
    label: "Catalog",
    icon: LayoutGrid,
    active: (p) => p === "/admin" || p.startsWith("/admin/products"),
  },
  { href: "/admin/orders", label: "Orders", icon: Receipt, active: (p) => p.startsWith("/admin/orders") },
  { href: "/admin/purchases", label: "Purchases", icon: ClipboardList, active: (p) => p.startsWith("/admin/purchases") },
  { href: "/admin/categories", label: "Categories", icon: Tags, active: (p) => p.startsWith("/admin/categories") },
  { href: "/admin/import", label: "Import", icon: FileSpreadsheet, active: (p) => p.startsWith("/admin/import") },
  { href: "/admin/tags", label: "Hang tags", icon: Barcode, active: (p) => p.startsWith("/admin/tags") },
  { href: "/admin/reports", label: "Reports", icon: ChartColumn, active: (p) => p.startsWith("/admin/reports") },
  {
    href: "/admin/team",
    label: "Team",
    icon: Users,
    active: (p) =>
      p.startsWith("/admin/team") ||
      p.startsWith("/admin/employees") ||
      p.startsWith("/admin/attendance") ||
      p.startsWith("/admin/leave") ||
      p.startsWith("/admin/targets") ||
      p.startsWith("/admin/sales-team"),
    badge: "leaves",
  },
  {
    href: "/admin/delete-requests",
    label: "Delete requests",
    icon: Trash2,
    active: (p) => p.startsWith("/admin/delete-requests"),
    badge: "deletes",
  },
];

/**
 * Text that is only shown while the desktop sidebar is open (hovered, or
 * reached with the keyboard; a mouse click must not keep it open). In the phone menu `rail` is false and text is always shown.
 */
const RAIL_TEXT =
  "opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100 group-has-[:focus-visible]/sidebar:opacity-100";

function NavLinks({
  pathname,
  onNavigate,
  pendingDeletes = 0,
  pendingLeaves = 0,
  rail = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  pendingDeletes?: number;
  pendingLeaves?: number;
  /** Desktop sidebar: icons only until the sidebar is hovered. */
  rail?: boolean;
}) {
  const counts = { deletes: pendingDeletes, leaves: pendingLeaves };

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.active(pathname);
        const count = item.badge ? counts[item.badge] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span className="relative shrink-0">
              <Icon className="size-4" />
              {rail && count > 0 ? (
                // Closed sidebar: a dot instead of the number.
                <span className="absolute -top-1 -right-1 size-2 rounded-full bg-amber-500 ring-2 ring-white group-hover/sidebar:hidden group-has-focus-visible/sidebar:hidden" />
              ) : null}
            </span>
            <span className={cn("truncate whitespace-nowrap", rail && RAIL_TEXT)}>{item.label}</span>
            {count > 0 ? (
              <span
                className={cn(
                  "ml-auto rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white",
                  rail && RAIL_TEXT
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState(0);
  const [pendingLeaves, setPendingLeaves] = useState(0);

  useEffect(() => {
    let cancelled = false;
    countPendingDeleteRequests(supabase).then((count) => {
      if (!cancelled) setPendingDeletes(count);
    });
    countPendingLeaves(supabase).then((count) => {
      if (!cancelled) setPendingLeaves(count);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-[#fafafa] text-foreground print:block print:min-h-0 print:bg-white">
      {/* Keeps the page content clear of the icon strip. The sidebar itself floats above the page when opened. */}
      <div className="hidden w-14 shrink-0 md:block print:hidden" aria-hidden />
      <aside className="group/sidebar fixed inset-y-0 left-0 z-30 hidden w-14 flex-col overflow-hidden border-r border-border/80 bg-white transition-[width,box-shadow] duration-200 ease-out hover:w-56 hover:shadow-xl has-focus-visible:w-56 has-focus-visible:shadow-xl md:flex print:hidden">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border/80 px-3">
          <Link href="/admin" className="flex min-w-0 items-center gap-2" title="Eshwari Vastra">
            <Image
              src="/brand/logo.png"
              alt="Eshwari Vastra"
              width={36}
              height={24}
              className="h-6 w-auto shrink-0 object-contain"
            />
            <div className={cn("min-w-0 leading-tight whitespace-nowrap", RAIL_TEXT)}>
              <p className="truncate text-sm font-semibold">Eshwari Vastra</p>
            </div>
          </Link>
        </div>
        <div className="flex flex-1 flex-col justify-between overflow-y-auto overflow-x-hidden p-2">
          <NavLinks pathname={pathname} pendingDeletes={pendingDeletes} pendingLeaves={pendingLeaves} rail />
          <div className="space-y-1">
            <Link
              href="/billing"
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MonitorSmartphone className="size-4 shrink-0" />
              <span className={cn("whitespace-nowrap", RAIL_TEXT)}>Open POS</span>
            </Link>
            <SignOutButton
              className="h-auto w-full px-2.5 py-2 text-sm font-medium text-muted-foreground"
              labelClassName={cn("whitespace-nowrap", RAIL_TEXT)}
            />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col print:block print:w-full">
        {/* Phones only: holds the menu button. On desktop the sidebar is the navigation and pages carry their own headings. */}
        <header className="sticky top-0 z-20 border-b border-border/80 bg-white md:hidden print:hidden">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="md:hidden"
                  />
                }
              >
                <Menu className="size-4" />
                <span className="sr-only">Open menu</span>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 gap-0 p-0">
                <SheetHeader className="border-b border-border/80 px-4 py-4">
                  <SheetTitle className="text-sm font-semibold">
                    Eshwari Vastra
                  </SheetTitle>
                </SheetHeader>
                <div className="flex h-full flex-col justify-between p-3">
                  <NavLinks
                    pathname={pathname}
                    pendingDeletes={pendingDeletes}
                    pendingLeaves={pendingLeaves}
                    onNavigate={() => setMenuOpen(false)}
                  />
                  <div className="space-y-1">
                    <Link
                      href="/billing"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <MonitorSmartphone className="size-4" />
                      Open POS
                    </Link>
                    <SignOutButton className="w-full text-muted-foreground" />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <div className="flex-1 print:m-0 print:p-0">{children}</div>
      </div>
    </div>
  );
}
