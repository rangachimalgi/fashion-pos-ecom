"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCartStore } from "@/store/useCartStore";

export function BagButton() {
  const cart = useCartStore((state) => state.cart);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const count = ready ? cart.reduce((sum, item) => sum + item.quantity, 0) : 0;

  return (
    <Link
      href="/bag"
      className="relative flex cursor-pointer flex-col items-center transition hover:text-brand"
      aria-label={count > 0 ? `Bag, ${count} items` : "Bag"}
    >
      <ShoppingBag className="h-5 w-5 stroke-[1.5]" />
      <span className="mt-1 text-[10px] font-bold tracking-tight uppercase">Bag</span>
      {count > 0 ? (
        <span className="absolute -top-1.5 -right-2 flex h-4 w-4 scale-95 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-extrabold text-white">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
