import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Back to the Home hub (reports live there). */
export function HomeBackLink({ label = "Home" }: { label?: string }) {
  return (
    <Link
      href="/admin/home"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}
