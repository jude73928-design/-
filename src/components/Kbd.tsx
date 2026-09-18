import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
