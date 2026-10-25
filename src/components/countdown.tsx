import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function Countdown({
  deadline,
  className,
  closedLabel = "Closed",
}: {
  deadline: string | null;
  className?: string;
  closedLabel?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!deadline) return null;
  const diff = new Date(deadline).getTime() - now;
  if (diff <= 0) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-destructive", className)}>
        <Clock className="h-4 w-4" /> {closedLabel}
      </span>
    );
  }
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const urgent = days < 3;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        urgent ? "text-clay" : "text-sage",
        className,
      )}
    >
      <Clock className="h-4 w-4" />
      {days > 0 ? `${days}d ${hours}h left` : `${hours}h left`}
    </span>
  );
}
