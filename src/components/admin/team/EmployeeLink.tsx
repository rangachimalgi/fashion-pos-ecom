import Link from "next/link";
import { cn } from "@/lib/utils";

/** Clickable employee name that opens their detail page. */
export function EmployeeLink({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <Link
      href={`/admin/team/${id}`}
      className={cn("font-medium hover:underline underline-offset-2", className)}
      onClick={(event) => event.stopPropagation()}
    >
      {name}
    </Link>
  );
}
