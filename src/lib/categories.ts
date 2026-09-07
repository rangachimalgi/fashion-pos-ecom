export const STORE_DEPARTMENTS = ["Men", "Women", "Kids"] as const;
export type StoreDepartment = (typeof STORE_DEPARTMENTS)[number];

export type CategoryMeta = {
  id: string;
  label: string;
  image: string;
  accent: string;
  accentSoft: string;
  tagline: string;
};

/** Department-specific shop categories + explore banners */
export const DEPARTMENT_CATEGORIES: Record<StoreDepartment, readonly CategoryMeta[]> = {
  Men: [
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
  ],
  Women: [
    {
      id: "Tops",
      label: "Tops",
      image: "/categories/tshirts.jpg",
      accent: "#C45B7A",
      accentSoft: "#F8E6EC",
      tagline: "Light layers, easy polish.",
    },
    {
      id: "Dresses",
      label: "Dresses",
      image: "/categories/shirts.jpg",
      accent: "#8B5A8C",
      accentSoft: "#F3E8F4",
      tagline: "From brunch to evening.",
    },
    {
      id: "Kurtis",
      label: "Kurtis",
      image: "/categories/hoodies.jpg",
      accent: "#B56B45",
      accentSoft: "#F6E9E0",
      tagline: "Everyday ethnic, soft drape.",
    },
    {
      id: "Jeans",
      label: "Jeans",
      image: "/categories/jeans.jpg",
      accent: "#4A5F7A",
      accentSoft: "#E8EEF5",
      tagline: "Fits that move with you.",
    },
  ],
  Kids: [
    {
      id: "Tshirts",
      label: "Tshirts",
      image: "/categories/tshirts.jpg",
      accent: "#3D9B8F",
      accentSoft: "#E3F5F2",
      tagline: "Play-ready color and comfort.",
    },
    {
      id: "Shorts",
      label: "Shorts",
      image: "/categories/shirts.jpg",
      accent: "#E0A106",
      accentSoft: "#FFF4D6",
      tagline: "Easy moves all day.",
    },
    {
      id: "Dresses",
      label: "Dresses",
      image: "/categories/hoodies.jpg",
      accent: "#E07A5F",
      accentSoft: "#FDECE7",
      tagline: "Soft prints, little joy.",
    },
    {
      id: "Sets",
      label: "Sets",
      image: "/categories/jeans.jpg",
      accent: "#5B6C8F",
      accentSoft: "#E8ECF5",
      tagline: "Matched outfits, zero fuss.",
    },
  ],
} as const;

/** Flat list kept for older Men-only references */
export const PRODUCT_CATEGORIES = DEPARTMENT_CATEGORIES.Men;

export type ProductCategory = string;

export function getCategoriesForDepartment(
  department: StoreDepartment
): readonly CategoryMeta[] {
  return DEPARTMENT_CATEGORIES[department];
}

export function getDefaultCategory(department: StoreDepartment): ProductCategory {
  return DEPARTMENT_CATEGORIES[department][0].id;
}

function isDepartment(value: string): value is StoreDepartment {
  return (STORE_DEPARTMENTS as readonly string[]).includes(value);
}

export function departmentToSlug(department: StoreDepartment): string {
  return department.toLowerCase();
}

export function categoryToSlug(category: ProductCategory): string {
  return category.toLowerCase().replace(/\s+/g, "-");
}

export function parseDepartmentSlug(slug: string): StoreDepartment | null {
  const match = STORE_DEPARTMENTS.find((d) => d.toLowerCase() === slug.toLowerCase());
  return match ?? null;
}

export function parseCategorySlug(
  slug: string,
  department?: StoreDepartment | null
): ProductCategory | null {
  const normalized = slug.toLowerCase().replace(/[\s_-]/g, "");
  const pools = department
    ? DEPARTMENT_CATEGORIES[department]
    : Object.values(DEPARTMENT_CATEGORIES).flat();

  const match = pools.find(
    (c) => c.id.toLowerCase().replace(/[\s_-]/g, "") === normalized
  );
  return match?.id ?? null;
}

export function getCategoryMeta(
  category: ProductCategory,
  department?: StoreDepartment | null
): CategoryMeta {
  if (department) {
    const inDept = DEPARTMENT_CATEGORIES[department].find((c) => c.id === category);
    if (inDept) return inDept;
  }

  for (const list of Object.values(DEPARTMENT_CATEGORIES)) {
    const found = list.find((c) => c.id === category);
    if (found) return found;
  }

  return DEPARTMENT_CATEGORIES.Men[0];
}

export function isCategoryInDepartment(
  department: StoreDepartment,
  category: ProductCategory
): boolean {
  return DEPARTMENT_CATEGORIES[department].some((c) => c.id === category);
}

export function shopCategoryPath(
  department: StoreDepartment,
  category: ProductCategory
): string {
  return `/shop/${departmentToSlug(department)}/${categoryToSlug(category)}`;
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

/** Bottom section / shop filters: null = all types */
export function productMatchesProductCategory(
  product: { category?: string | null },
  productCategory: ProductCategory | null
): boolean {
  if (!productCategory) return true;

  const raw = product.category?.trim();
  if (!raw || isDepartment(raw)) return false;

  const normalized = raw.toLowerCase().replace(/[\s_-]/g, "");
  const target = productCategory.toLowerCase().replace(/[\s_-]/g, "");
  return normalized === target;
}
