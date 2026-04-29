import type { ReactNode } from "react";
import { TopBar } from "~/components/top-bar";
import { cn } from "~/lib/utils";

export function PageShell({
  children,
  className,
  size = "md",
}: {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const max = size === "sm" ? "max-w-xl" : size === "lg" ? "max-w-5xl" : "max-w-3xl";
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopBar />
      <main className={cn("container mx-auto px-4 py-8", max, className)}>{children}</main>
    </div>
  );
}
