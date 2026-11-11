import { Banknote, Smartphone } from "lucide-react";
import { paymentLabel, sourceLabel } from "@/lib/formatOrder";
import type { AdminOrder } from "@/types/order";
import { cn } from "@/lib/utils";

export function ChannelBadge({ source }: { source: AdminOrder["source"] }) {
  const online = source === "ONLINE";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium tracking-wide uppercase",
        online ? "bg-brand/10 text-[#8a5d1c]" : "bg-slate-100 text-slate-600"
      )}
    >
      {sourceLabel(source)}
    </span>
  );
}

export function PaymentTag({
  method,
  source,
  className,
}: {
  method: AdminOrder["payment_method"];
  source?: AdminOrder["source"];
  className?: string;
}) {
  const Icon = method === "UPI" ? Smartphone : Banknote;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm text-foreground/80", className)}>
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      {paymentLabel(method, source)}
    </span>
  );
}
