import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "accent";
  size?: "sm" | "md" | "lg";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center gap-2 rounded-lg font-mono text-xs font-semibold transition-all duration-150 cubic-bezier(0.16, 1, 0.3, 1) active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-sky-500/40 select-none";

    const variants = {
      primary: "bg-[#17191D] hover:bg-[#25282D] dark:bg-[#242930] dark:hover:bg-[#30353D] text-white border border-transparent dark:border-[#30353D] shadow-sm",
      secondary: "bg-[#EEF0F3] hover:bg-[#E2E5E9] dark:bg-[#1D2127] dark:hover:bg-[#242930] text-[#17191D] dark:text-[#F5F7FA] border border-[#E2E5E9] dark:border-[#30353D]",
      outline: "bg-white hover:bg-[#F8F9FB] dark:bg-[#171A1F] dark:hover:bg-[#1D2127] text-[#17191D] dark:text-[#F5F7FA] border border-[#E2E5E9] dark:border-[#30353D] shadow-sm",
      ghost: "bg-transparent hover:bg-[#EEF0F3] dark:hover:bg-[#1D2127] text-[#646A73] dark:text-[#A7ADB7] hover:text-[#17191D] dark:hover:text-[#F5F7FA]",
      danger: "bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800",
      accent: "bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600 text-white shadow-sm shadow-sky-500/20",
    };

    const sizes = {
      sm: "px-2.5 py-1.5 text-[11px]",
      md: "px-3.5 py-2 text-xs",
      lg: "px-4 py-2.5 text-sm",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
