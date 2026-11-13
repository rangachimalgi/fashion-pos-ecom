/**
 * Product sizes: clothing letters, numeric codes (039), and fabric length in metres.
 * The database stores size as free text; this file only helps with hints and sorting.
 */

/** Common picks for the size box (clothing + fabric metres). */
export const SIZE_SUGGESTIONS = [
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "Free Size",
  "OS",
  "1 mts",
  "1.5 mts",
  "2 mts",
  "2.5 mts",
  "3 mts",
  "4 mts",
  "5 mts",
  "5.5 mts",
  "6 mts",
  "9 mts",
] as const;

const CLOTHING_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "FREE SIZE", "OS", "ONE SIZE"] as const;

/** "2 mts", "2.5m", "2 metre", "2 meters" → metres as a number, or null. */
export function metresFromSize(size: string): number | null {
  const match = size
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(?:mts?|mtrs?|metres?|meters?|m)\.?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** Sort clothing letters first, then metre lengths, then anything else (039, custom). */
export function compareSizes(a: string, b: string): number {
  const aKey = a.trim().toUpperCase();
  const bKey = b.trim().toUpperCase();

  const aCloth = CLOTHING_ORDER.indexOf(aKey as (typeof CLOTHING_ORDER)[number]);
  const bCloth = CLOTHING_ORDER.indexOf(bKey as (typeof CLOTHING_ORDER)[number]);
  if (aCloth !== -1 || bCloth !== -1) {
    if (aCloth === -1) return 1;
    if (bCloth === -1) return -1;
    return aCloth - bCloth;
  }

  const aM = metresFromSize(a);
  const bM = metresFromSize(b);
  if (aM !== null || bM !== null) {
    if (aM === null) return 1;
    if (bM === null) return -1;
    return aM - bM;
  }

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export const SIZE_FIELD_HINT = "S–XXL, Free Size, or fabric length like 2 mts / 5.5 mts";
export const SIZE_FIELD_PLACEHOLDER = "M or 2 mts";
