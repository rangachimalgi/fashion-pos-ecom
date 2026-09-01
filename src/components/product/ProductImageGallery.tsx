"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type ProductImageGalleryProps = {
  images: string[];
  alt: string;
};

const THUMB_SIZE = 72;
const THUMB_GAP = 8;
const VISIBLE_THUMBS = 5;

export function ProductImageGallery({ images, alt }: ProductImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const thumbListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [images]);

  useEffect(() => {
    const container = thumbListRef.current;
    if (!container) return;

    const updateScrollState = () => {
      setCanScrollUp(container.scrollTop > 0);
      setCanScrollDown(
        container.scrollTop + container.clientHeight < container.scrollHeight - 1
      );
    };

    updateScrollState();
    container.addEventListener("scroll", updateScrollState);
    window.addEventListener("resize", updateScrollState);

    return () => {
      container.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [images.length]);

  const scrollThumbnails = (direction: "up" | "down") => {
    const container = thumbListRef.current;
    if (!container) return;

    const step = THUMB_SIZE + THUMB_GAP;
    container.scrollBy({
      top: direction === "up" ? -step : step,
      behavior: "smooth",
    });
  };

  if (!images.length) {
    return (
      <div className="flex aspect-3/4 w-full items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 p-12 text-center text-xs font-bold text-slate-300">
        Image Asset Unavailable
      </div>
    );
  }

  const activeImage = images[selectedIndex] ?? images[0];
  const showScrollControls = images.length > VISIBLE_THUMBS;

  return (
    <div className="flex gap-3 md:gap-4">
      <div className="flex shrink-0 flex-col items-center gap-2">
        <div
          ref={thumbListRef}
          className="flex flex-col gap-2 overflow-y-auto scroll-smooth [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden"
          style={{ maxHeight: VISIBLE_THUMBS * THUMB_SIZE + (VISIBLE_THUMBS - 1) * THUMB_GAP }}
        >
          {images.map((image, index) => {
            const isSelected = index === selectedIndex;

            return (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                aria-label={`View product image ${index + 1}`}
                aria-current={isSelected}
                className={cn(
                  "h-18 w-18 shrink-0 overflow-hidden rounded-md border bg-white transition",
                  isSelected
                    ? "border-slate-900 ring-1 ring-slate-900"
                    : "border-slate-200 hover:border-slate-400"
                )}
              >
                <img
                  src={image}
                  alt={`${alt} thumbnail ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>

        {showScrollControls && (
          <div className="flex flex-col items-center gap-1 text-slate-500">
            <button
              type="button"
              onClick={() => scrollThumbnails("up")}
              disabled={!canScrollUp}
              aria-label="Scroll thumbnails up"
              className="rounded p-0.5 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronUp className="size-4 stroke-2" />
            </button>
            <button
              type="button"
              onClick={() => scrollThumbnails("down")}
              disabled={!canScrollDown}
              aria-label="Scroll thumbnails down"
              className="rounded p-0.5 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronDown className="size-4 stroke-2" />
            </button>
          </div>
        )}
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="aspect-3/4 w-full">
          <img
            src={activeImage}
            alt={`${alt} image ${selectedIndex + 1}`}
            className="h-full w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}
