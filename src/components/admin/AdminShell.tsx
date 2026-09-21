"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutGrid, Menu, MonitorSmartphone, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function pageTitle(pathname: string) {
  if (pathname.startsWith("/admin/products/new")) return "New product";
  if (pathname.includes("/edit")) return "Edit product";
  if (pathname.startsWith("/admin/orders/") && pathname !== "/admin/orders") {
    return "Order";
  }
  if (pathname.startsWith("/admin/orders")) return "Orders";
  return "Catalog";
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const catalogActive =
    pathname === "/admin" || pathname.startsWith("/admin/products");
  const ordersActive = pathname.startsWith("/admin/orders");

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
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const title = pageTitle(pathname);

  return (
    <div className="flex min-h-screen bg-[#fafafa] text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border/80 bg-white md:flex">
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
          <NavLinks pathname={pathname} />
          <Link
            href="/billing"
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MonitorSmartphone className="size-4" />
            Open POS
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-white">
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
                    onNavigate={() => setMenuOpen(false)}
                  />
                  <Link
                    href="/billing"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <MonitorSmartphone className="size-4" />
                    Open POS
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
            <div>
              <p className="text-[11px] text-muted-foreground">Admin</p>
              <h1 className="text-base font-semibold tracking-tight">{title}</h1>
            </div>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
