import { cn } from "@/lib/cn";

export function StatusBadge({
  ok,
  children,
  className,
}: {
  ok: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
        ok ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
        className,
      )}
    >
      {children}
    </span>
  );
}
