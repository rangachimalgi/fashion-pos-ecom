import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import {
  STORE_DEPARTMENTS,
  getDefaultCategory,
  shopCategoryPath,
} from "@/lib/categories";

const helpLinks = [
  { href: "/bag", label: "My bag" },
  { href: "/wishlist", label: "Wishlist" },
];

export function StoreFooter() {
  return (
    <footer className="mt-auto">
      <div className="bg-rose-600 py-3 text-center text-xs font-black tracking-[0.28em] text-white uppercase sm:text-sm">
        Homegrown Indian brand
      </div>

      <div className="bg-slate-100 px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 flex justify-center">
            <BrandLogo height={72} />
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div>
              <p className="mb-4 text-xs font-black tracking-[0.16em] text-rose-600 uppercase">
                Need help
              </p>
              <ul className="space-y-2.5 text-sm font-bold text-slate-800">
                {helpLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hover:text-rose-600">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-4 text-xs font-black tracking-[0.16em] text-rose-600 uppercase">
                Shop
              </p>
              <ul className="space-y-2.5 text-sm font-bold text-slate-800">
                {STORE_DEPARTMENTS.map((department) => (
                  <li key={department}>
                    <Link
                      href={`/?department=${department.toLowerCase()}`}
                      className="hover:text-rose-600"
                    >
                      {department}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-4 text-xs font-black tracking-[0.16em] text-rose-600 uppercase">
                Categories
              </p>
              <ul className="space-y-2.5 text-sm font-bold text-slate-800">
                {STORE_DEPARTMENTS.map((department) => (
                  <li key={department}>
                    <Link
                      href={shopCategoryPath(department, getDefaultCategory(department))}
                      className="hover:text-rose-600"
                    >
                      {department} {getDefaultCategory(department)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-4 text-xs font-black tracking-[0.16em] text-rose-600 uppercase">
                More
              </p>
              <ul className="space-y-2.5 text-sm font-bold text-slate-800">
                <li>
                  <Link href="/" className="hover:text-rose-600">
                    Home
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <p className="mt-10 border-t border-slate-200 pt-6 text-center text-xs font-bold text-slate-500">
            © {new Date().getFullYear()} Eshwari Vastra
          </p>
        </div>
      </div>
    </footer>
  );
}
