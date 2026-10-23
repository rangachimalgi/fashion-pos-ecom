"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function TagBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 40,
      width: 2,
      background: "transparent",
    });
    // Let CSS size the bars (stretch to the box) instead of fixed pixel width/height.
    const svg = ref.current;
    const w = svg.getAttribute("width");
    const h = svg.getAttribute("height");
    if (w && h) svg.setAttribute("viewBox", `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", "none");
  }, [value]);

  return <svg ref={ref} className="h-[8mm] w-[40mm] max-w-full" />;
}
