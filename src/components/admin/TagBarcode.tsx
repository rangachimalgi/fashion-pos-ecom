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
      width: 1,
      background: "transparent",
    });
  }, [value]);

  return <svg ref={ref} className="h-[18mm] w-[20mm] max-w-full" />;
}
