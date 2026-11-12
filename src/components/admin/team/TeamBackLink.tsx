import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Small link back to the Team hub, used at the top of each people-related page. */
export function TeamBackLink({ label = "Team" }: { label?: string }) {
  return (
    <Link
      href="/admin/team"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}
