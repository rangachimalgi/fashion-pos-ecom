import { redirect } from "next/navigation";

export default function BillingAddProductRedirect() {
  redirect("/admin/products/new");
}
