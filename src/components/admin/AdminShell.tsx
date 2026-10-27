"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Barcode, ChartColumn, FileSpreadsheet, LayoutGrid, Menu, MonitorSmartphone, Receipt, Tags, Trash2, Users } from "lucide-react";
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

function pageTitle(pathname: string) {
  if (pathname.startsWith("/admin/products/new")) return "New product";
  if (pathname.includes("/edit")) return "Edit product";
  if (pathname.startsWith("/admin/orders/") && pathname !== "/admin/orders") {
    return "Order";
  }
  if (pathname.startsWith("/admin/orders")) return "Orders";
  if (pathname.startsWith("/admin/delete-requests")) return "Delete requests";
  if (pathname.startsWith("/admin/sales-team")) return "Sales team";
  if (pathname.startsWith("/admin/reports")) return "Sales & profit";
  if (pathname.startsWith("/admin/categories")) return "Categories";
  if (pathname.startsWith("/admin/import")) return "Import invoice";
  if (pathname.startsWith("/admin/tags")) return "Hang tags";
  return "Catalog";
}

function NavLinks({
  pathname,
  onNavigate,
  pendingDeletes = 0,
}: {
  pathname: string;
  onNavigate?: () => void;
  pendingDeletes?: number;
}) {
  const catalogActive =
    pathname === "/admin" || pathname.startsWith("/admin/products");
  const ordersActive = pathname.startsWith("/admin/orders");
  const categoriesActive = pathname.startsWith("/admin/categories");
  const importActive = pathname.startsWith("/admin/import");
  const tagsActive = pathname.startsWith("/admin/tags");
  const deletesActive = pathname.startsWith("/admin/delete-requests");
  const salesActive = pathname.startsWith("/admin/sales-team");
  const reportsActive = pathname.startsWith("/admin/reports");

  return (
    <nav className="flex flex-col gap-1">
      <Link
        href="/admin"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
          catalogActive
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <LayoutGrid className="size-4" />
        Catalog
      </Link>
      <Link
        href="/admin/orders"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
          ordersActive
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Receipt className="size-4" />
        Orders
      </Link>
      <Link
        href="/admin/categories"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
          categoriesActive
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Tags className="size-4" />
        Categories
      </Link>
      <Link
        href="/admin/import"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
          importActive
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <FileSpreadsheet className="size-4" />
        Import
      </Link>
      <Link
        href="/admin/tags"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
          tagsActive
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Barcode className="size-4" />
        Hang tags
      </Link>
      <Link
        href="/admin/reports"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
          reportsActive
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <ChartColumn className="size-4" />
        Sales &amp; profit
      </Link>
      <Link
        href="/admin/sales-team"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
          salesActive
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Users className="size-4" />
        Sales team
      </Link>
      <Link
        href="/admin/delete-requests"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
          deletesActive
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Trash2 className="size-4" />
        Delete requests
        {pendingDeletes > 0 ? (
          <span className="ml-auto rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">
            {pendingDeletes}
          </span>
        ) : null}
      </Link>
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState(0);
  const title = pageTitle(pathname);

  useEffect(() => {
    let cancelled = false;
    countPendingDeleteRequests(supabase).then((count) => {
      if (!cancelled) setPendingDeletes(count);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-[#fafafa] text-foreground print:block print:min-h-0 print:bg-white">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border/80 bg-white md:flex print:hidden">
        <div className="flex items-center gap-2.5 border-b border-border/80 px-4 py-4">
          <Link href="/admin" className="flex min-w-0 items-center gap-2">
            <Image
              src="/brand/logo.png"
              alt="Eshwari Vastra"
              width={36}
              height={24}
              className="h-6 w-auto object-contain"
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">Eshwari Vastra</p>
              <p className="text-[11px] text-muted-foreground">Back office</p>
            </div>
          </Link>
        </div>
        <div className="flex flex-1 flex-col justify-between p-3">
          <NavLinks pathname={pathname} pendingDeletes={pendingDeletes} />
          <div className="space-y-1">
            <Link
              href="/billing"
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MonitorSmartphone className="size-4" />
              Open POS
            </Link>
            <SignOutButton className="w-full text-muted-foreground" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col print:block print:w-full">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-white print:hidden">
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
            <div>
              <p className="text-[11px] text-muted-foreground">Admin</p>
              <h1 className="text-base font-semibold tracking-tight">{title}</h1>
            </div>
          </div>
        </header>
        <div className="flex-1 print:m-0 print:p-0">{children}</div>
      </div>
    </div>
  );
}
