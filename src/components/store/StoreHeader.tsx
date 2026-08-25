"use client";

import { Menu, Search, Heart, User } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { BagButton } from "@/components/cart/CartDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const QUICK_CATEGORIES = ["Men", "Women", "Kids"];

const searchInputClass =
  "h-9 rounded-full border-2 border-slate-400 bg-white pr-3 text-xs shadow-sm transition-colors placeholder:text-slate-400 focus-visible:border-slate-700 focus-visible:ring-2 focus-visible:ring-slate-200 md:h-10 md:text-sm";

type StoreHeaderProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
};

export function StoreHeader({ searchQuery, onSearchChange }: StoreHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4 md:gap-4 md:px-6 md:py-5">
        {/* Left: menu + quick categories */}
        <div className="flex min-w-0 items-center justify-start gap-2 sm:gap-3 md:gap-5">
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-slate-700 hover:text-brand"
                />
              }
            >
              <Menu className="size-5 stroke-[1.75]" />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>

            <SheetContent side="left" className="w-[min(100%,20rem)] gap-0 border-slate-100 p-0">
              <SheetHeader className="border-b border-slate-100 px-5 py-4">
                <SheetTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-900">
                  Menu
                </SheetTitle>
              </SheetHeader>

              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <p className="text-sm font-black uppercase tracking-wider text-slate-900">
                  Coming soon
                </p>
                <p className="mt-2 max-w-56 text-xs leading-relaxed text-slate-400">
                  More collections, offers, and shop links will show up here.
                </p>
              </div>
            </SheetContent>
          </Sheet>

          <nav className="flex min-w-0 items-center gap-2 overflow-x-auto sm:gap-3 md:gap-5">
            {QUICK_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className="shrink-0 text-[9px] font-bold tracking-wider uppercase text-slate-600 transition hover:text-brand sm:text-[10px] md:text-xs"
              >
                {category}
              </button>
            ))}
          </nav>
        </div>

        {/* Center: logo */}
        <div className="flex justify-center">
          <BrandLogo height={72} />
        </div>

        {/* Right: search + account actions */}
        <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 md:gap-3">
          <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-52 md:max-w-64 lg:max-w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search styles..."
              className={`${searchInputClass} pl-9 md:pl-10`}
            />
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden text-slate-700 hover:text-brand sm:inline-flex md:hidden"
            aria-label="Profile"
          >
            <User className="size-4 stroke-[1.75]" />
          </Button>

          <div className="hidden flex-col items-center md:flex">
            <Button variant="ghost" size="icon-sm" className="text-slate-700 hover:text-brand">
              <User className="size-4 stroke-[1.75]" />
            </Button>
            <span className="text-[9px] font-bold uppercase tracking-tight text-slate-500">Profile</span>
          </div>

          <div className="hidden flex-col items-center md:flex">
            <Button variant="ghost" size="icon-sm" className="text-slate-700 hover:text-brand">
              <Heart className="size-4 stroke-[1.75]" />
            </Button>
            <span className="text-[9px] font-bold uppercase tracking-tight text-slate-500">
              Wishlist
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            className="text-slate-700 hover:text-brand md:hidden"
            aria-label="Wishlist"
          >
            <Heart className="size-4 stroke-[1.75]" />
          </Button>

          <BagButton />
        </div>
      </div>

      {/* Mobile search row */}
      <div className="border-t border-slate-100 px-4 pb-3 sm:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-500" />
          <Input
            id="mobile-store-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search apparel, brands, colors..."
            className={`${searchInputClass} w-full pl-10`}
          />
        </div>
      </div>
    </header>
  );
}
