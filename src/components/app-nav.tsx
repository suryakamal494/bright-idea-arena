import { useState } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarClock,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  PenLine,
  Scale,
  Sprout,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof Home };

const NAV: Record<string, NavItem[]> = {
  student: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/team", label: "Team", icon: Users },
    { to: "/submission", label: "Entry", icon: PenLine },
    { to: "/learning", label: "Learn", icon: BookOpen },
  ],
  admin: [
    { to: "/admin", label: "Overview", icon: LayoutDashboard },
    { to: "/admin/submissions", label: "Entries", icon: Inbox },
    { to: "/admin/deadlines", label: "Deadlines", icon: CalendarClock },
    { to: "/admin/judges", label: "Judges", icon: Scale },
    { to: "/admin/broadcasts", label: "Broadcast", icon: Megaphone },
  ],
  judge: [{ to: "/judge", label: "Queue", icon: Inbox }],
  coordinator: [{ to: "/coordinator", label: "Roster", icon: Users }],
};

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest text-linen">
        <Sprout className="h-5 w-5" />
      </span>
      {!compact && (
        <span className="font-display text-[15px] font-semibold leading-tight text-forest">
          Social Innovation
          <br />
          Ideathon
        </span>
      )}
    </Link>
  );
}

export function AppNav({ role, name }: { role: AppRole; name: string }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = NAV[role] ?? [];
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOutEverywhere();
    router.navigate({ to: "/auth", replace: true });
  }

  const isActive = (to: string) =>
    to === "/admin" || to === "/judge" || to === "/coordinator" || to === "/dashboard"
      ? pathname === to
      : pathname.startsWith(to);

  return (
    <>
      {/* Desktop top navigation */}
      <header className="no-print sticky top-0 z-40 hidden border-b border-border bg-linen/90 backdrop-blur md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Brand />
          <nav className="flex items-center gap-1">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  isActive(item.to)
                    ? "bg-forest text-linen"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-clay/15 text-sm font-semibold text-clay">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-32 truncate text-sm font-medium">{name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-muted-foreground">{name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} disabled={busy}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-40 border-b border-border bg-linen/90 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-full bg-clay/15 text-sm font-semibold text-clay">
                {name.slice(0, 1).toUpperCase()}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-muted-foreground">{name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} disabled={busy}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile bottom thumb navigation */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-colors",
                isActive(item.to) ? "text-clay" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
