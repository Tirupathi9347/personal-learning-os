import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-[#EEF0F3]/80 border border-[#E2E5E9]/50",
        className
      )}
      {...props}
    />
  );
}
