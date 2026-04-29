import type { ReactNode } from "react";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

export type Status = "pending" | "active" | "organizer" | "member" | "rejected";

const VARIANTS: Record<Status, string> = {
  pending: "bg-gdg-yellow/15 text-gdg-yellow border-gdg-yellow/30",
  active: "bg-gdg-green/15 text-gdg-green border-gdg-green/30",
  member: "bg-gdg-green/15 text-gdg-green border-gdg-green/30",
  organizer: "bg-gdg-blue/15 text-gdg-blue border-gdg-blue/30",
  rejected: "bg-gdg-red/15 text-gdg-red border-gdg-red/30",
};

export function StatusBadge({
  status,
  children,
  className,
}: {
  status: Status;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(VARIANTS[status], className)}>
      {children}
    </Badge>
  );
}
