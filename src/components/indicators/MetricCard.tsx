import { cn } from "@/lib/cn";

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}

export function MetricCard({ label, value, sub, accent }: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-4 shadow-sm",
        accent ? "border-accent" : "border-neutralbrand/40",
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-neutralbrand">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-bold",
          accent ? "text-accent" : "text-brand-dark",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-sm text-neutralbrand">{sub}</div> : null}
    </div>
  );
}
