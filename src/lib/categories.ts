export const STORE_DEPARTMENTS = ["Men", "Women", "Kids"] as const;
export type StoreDepartment = (typeof STORE_DEPARTMENTS)[number];

export const PRODUCT_CATEGORIES = [
  {
    id: "Tshirts",
    label: "Tshirts",
    image: "/categories/tshirts.jpg",
    accent: "#C4A574",
    accentSoft: "#F3E8D8",
    tagline: "Everyday fits, clean drops.",
  },
  {
    id: "Shirts",
    label: "Shirts",
    image: "/categories/shirts.jpg",
    accent: "#BB802A",
    accentSoft: "#F6E7D0",
    tagline: "Sharp layers for every day.",
  },
  {
    id: "Jeans",
    label: "Jeans",
    image: "/categories/jeans.jpg",
    accent: "#3D4F66",
    accentSoft: "#E4E9F0",
    tagline: "Denim that holds its shape.",
  },
  {
    id: "Hoodies",
    label: "Hoodies",
    image: "/categories/hoodies.jpg",
    accent: "#6B4F3A",
    accentSoft: "#EFE6DE",
    tagline: "Soft weight, easy street.",
  },
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]["id"];

function isDepartment(value: string): value is StoreDepartment {
  return (STORE_DEPARTMENTS as readonly string[]).includes(value);
}

/** Header Men/Women/Kids */
export function productMatchesDepartment(
  product: { department?: string | null; category?: string | null },
  department: StoreDepartment
): boolean {
  const dept = product.department?.trim();
  if (dept) return dept === department;

  // Legacy: category used to store Men/Women/Kids
  const legacy = product.category?.trim();
  if (legacy && isDepartment(legacy)) return legacy === department;

  // Untagged → Men
  return department === "Men";
}

/** Bottom section: Tshirts / Shirts / etc. null = all types */
export function productMatchesProductCategory(
  product: { category?: string | null },
  productCategory: ProductCategory | null
): boolean {
  if (!productCategory) return true;

  const value = product.category?.trim();
  if (!value || isDepartment(value)) return false;

  return value.toLowerCase() === productCategory.toLowerCase();
}
