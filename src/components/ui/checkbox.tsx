import { forwardRef, type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <span className="relative inline-flex size-4 shrink-0">
      <input
        ref={ref}
        type="checkbox"
        data-slot="checkbox"
        className={cn(
          "peer size-4 shrink-0 appearance-none rounded border border-input bg-background transition-colors checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <Check
        className="pointer-events-none absolute inset-0 size-4 scale-0 text-primary-foreground transition-transform peer-checked:scale-100"
        strokeWidth={3}
      />
    </span>
  ),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
