import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ icon, title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col xl:flex-row xl:items-center justify-between pb-4 border-b border-[var(--exec-border)] gap-4",
        className
      )}
      {...props}
    >
      <div className="space-y-1 min-w-[260px]">
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className="p-2 rounded-lg bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] text-sky-600 dark:text-sky-400 shrink-0">
              {icon}
            </div>
          )}
          <h1 className="text-lg sm:text-xl font-heading font-bold text-[var(--exec-text)] tracking-tight whitespace-nowrap">
            {title}
          </h1>
        </div>
        {description && (
          <p className="text-xs text-[var(--exec-text-muted)] font-sans pl-0.5 max-w-3xl">
            {description}
          </p>
        )}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
