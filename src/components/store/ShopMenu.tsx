"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  STORE_DEPARTMENTS,
  getCategoriesForDepartment,
  shopCategoryPath,
  type StoreDepartment,
} from "@/lib/categories";
import { cn } from "@/lib/utils";

type ShopMenuProps = {
  selectedDepartment: StoreDepartment;
};

export function ShopMenu({ selectedDepartment }: ShopMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuDept, setMenuDept] = useState<StoreDepartment>(selectedDepartment);

  useEffect(() => {
    setMenuDept(selectedDepartment);
  }, [selectedDepartment]);

  const categories = getCategoriesForDepartment(menuDept);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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

      <SheetContent
        side="left"
        className="w-[min(100%,26rem)] gap-0 overflow-y-auto border-slate-100 p-0"
      >
        <SheetHeader className="border-b border-slate-100 px-0 py-0">
          <SheetTitle className="sr-only">Shop menu</SheetTitle>
          <div className="grid grid-cols-3">
            {STORE_DEPARTMENTS.map((department) => {
              const isActive = menuDept === department;
              return (
                <button
                  key={department}
                  type="button"
                  onClick={() => setMenuDept(department)}
                  className={cn(
                    "border-b-2 py-3.5 text-xs font-black tracking-[0.14em] uppercase",
                    isActive
                      ? "border-brand text-brand"
                      : "border-transparent text-slate-400 hover:text-slate-700"
                  )}
                >
                  {department}
                </button>
              );
            })}
          </div>
        </SheetHeader>

        <div className="px-4 py-5">
          <p className="mb-4 text-sm font-bold text-slate-500">Categories</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={shopCategoryPath(menuDept, category.id)}
                onClick={() => setOpen(false)}
                className="group text-center"
              >
                <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-xl bg-slate-100">
                  <Image
                    src={category.image}
                    alt={category.label}
                    fill
                    sizes="140px"
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                </div>
                <p className="mt-2 text-xs font-bold text-slate-800">{category.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
