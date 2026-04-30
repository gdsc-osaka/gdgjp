import { UserButton } from "@clerk/react-router";
import { BarChart3, LinkIcon, Tag as TagIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { GdgMark } from "~/components/gdg-mark";
import { ThemeToggle } from "~/components/theme-toggle";
import { cn } from "~/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LinkIcon;
};

type NavGroup = {
  heading?: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ to: "/dashboard", label: "Links", icon: LinkIcon }],
  },
  {
    heading: "Insights",
    items: [{ to: "/analytics", label: "Analytics", icon: BarChart3 }],
  },
  {
    heading: "Library",
    items: [{ to: "/tags", label: "Tags", icon: TagIcon }],
  },
];

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-accent text-foreground font-medium [&_svg]:text-primary"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {item.label}
    </Link>
  );
}

function Sidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/40 md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <GdgMark size="sm" />
        <span className="font-medium tracking-tight">GDG Japan Links</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <p className="px-2 pb-2 pt-1 text-base font-semibold tracking-tight">Short Links</p>
        <div className="space-y-4">
          {NAV_GROUPS.map((group, idx) => (
            <div key={group.heading ?? `group-${idx}`}>
              {group.heading ? (
                <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {group.heading}
                </p>
              ) : null}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.to}
                    item={item}
                    active={
                      item.to === "/dashboard"
                        ? pathname === "/" || pathname === "/dashboard"
                        : pathname === item.to || pathname.startsWith(`${item.to}/`)
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
      <div className="flex items-center justify-between border-t px-3 py-2">
        <UserButton />
        <ThemeToggle />
      </div>
    </aside>
  );
}

function MobileBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:hidden">
      <Link to="/dashboard" className="flex items-center gap-2">
        <GdgMark size="sm" />
        <span className="font-medium tracking-tight">GDG Japan Links</span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserButton />
      </div>
    </header>
  );
}

export function DashboardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground md:flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar />
        <main className={cn("flex-1 px-4 py-6 md:px-8 md:py-8", className)}>{children}</main>
      </div>
    </div>
  );
}
