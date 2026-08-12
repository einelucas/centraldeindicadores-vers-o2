import { forwardRef, type LabelHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      data-slot="label"
      className={cn(
        "text-[11px] font-bold uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export { Label };
