import { ComponentProps, forwardRef } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/utils";

interface SearchFieldProps extends Omit<ComponentProps<typeof Input>, "className" | "type" | "aria-label"> {
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
}

const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ placeholder, ariaLabel, className, inputClassName, style, ...inputProps }, ref) => {
    return (
      <div className={cn("relative", className)}>
        <span className="pointer-events-none absolute inset-y-0 left-4 z-10 flex items-center">
          <Search className="h-4 w-4 text-muted-foreground" />
        </span>
        <Input
          ref={ref}
          type="text"
          {...inputProps}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          style={{ paddingLeft: "3rem", paddingRight: "1rem", ...style }}
          className={cn("h-12 bg-secondary border-border py-0", inputClassName)}
        />
      </div>
    );
  }
);
SearchField.displayName = "SearchField";

export default SearchField;
