import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AdminMetricCard({
  label,
  value,
  sub,
  badge,
  icon: Icon,
  tone = "default",
  valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: ReactNode;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "destructive";
  valueClassName?: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-accent"
        : tone === "destructive"
          ? "text-danger"
          : "text-foreground";
  const iconClass = tone === "default" ? "text-muted-foreground" : toneClass;

  return (
    <Card className="flex flex-row items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={cn("mt-1.5 text-2xl font-extrabold", toneClass, valueClassName)}>
          {value}
        </div>
        {sub ? <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div> : null}
        {badge ? <div className="mt-1.5">{badge}</div> : null}
      </div>
      <Icon className={cn("size-4 shrink-0", iconClass)} />
    </Card>
  );
}
