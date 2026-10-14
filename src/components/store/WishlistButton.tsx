"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { useWishlistStore } from "@/store/useWishlistStore";

export function WishlistButton() {
  const items = useWishlistStore((state) => state.items);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const count = ready ? items.length : 0;
  const saved = count > 0;

  return (
    <Link
      href="/wishlist"
      className="relative flex flex-col items-center text-slate-700 transition hover:text-brand"
      aria-label={saved ? `Wishlist, ${count} saved` : "Wishlist"}
    >
      <Heart className={`size-5 stroke-[1.5] ${saved ? "fill-rose-500 stroke-rose-500" : ""}`} />
      <span className="mt-1 text-[10px] font-bold tracking-tight uppercase">
        Wishlist
      </span>
      {saved ? (
        <span className="absolute -top-1.5 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-extrabold text-white scale-95">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
