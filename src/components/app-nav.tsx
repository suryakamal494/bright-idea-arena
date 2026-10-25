import { useState } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  CalendarClock,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  PenLine,
  Scale,
  Users,
} from "lucide-react";
import icorgLogo from "@/assets/icorg-logo.png.asset.json";
import { cn } from "@/lib/utils";
import { signOutEverywhere, type AppRole } from "@/lib/auth";
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
    { to: "/submission", label: "Submission form", icon: PenLine },
    { to: "/learning", label: "Resources", icon: BookOpen },
  ],
  admin: [
    { to: "/admin", label: "Overview", icon: LayoutDashboard },
    { to: "/admin/directory", label: "Directory", icon: Users },
    { to: "/admin/submissions", label: "Submissions", icon: Inbox },
    { to: "/admin/deadlines", label: "Deadlines", icon: CalendarClock },
    { to: "/admin/judges", label: "Judges", icon: Scale },
    { to: "/admin/broadcasts", label: "Broadcast", icon: Megaphone },
  ],
  judge: [{ to: "/judge", label: "Evaluation queue", icon: Inbox }],
  coordinator: [{ to: "/coordinator", label: "School roster", icon: Users }],
};

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="Social Innovation Ideathon, organized by ICORG"
      className="flex items-center gap-3"
    >
      <img src={icorgLogo.url} alt="ICORG" className="h-6 w-auto shrink-0" />
      {!compact && (
        <>
          <span className="h-7 w-px bg-border" aria-hidden />
          <span className="leading-tight">
            <span className="block font-display text-[15px] font-semibold text-forest">
              Social Innovation Ideathon
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Organized by ICORG
            </span>
          </span>
        </>
      )}
    </Link>
  );
}

export function OrgFooter() {
  return (
    <footer className="no-print border-t border-border py-5 text-center text-xs text-muted-foreground">
      Organized by <span className="font-semibold text-forest">ICORG</span> · Social Innovation
      Ideathon
    </footer>
  );
}

const MOBILE_SHORT: Record<string, string> = {
  "Submission form": "Submission",
  "Evaluation queue": "Queue",
  "School roster": "Roster",
};

export function AppNav({ role, name }: { role: AppRole; name: string }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = NAV[role] ?? [];
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    // Start collapsed on narrow desktops so the menu never eats the content —
    // tablets keep a usable working width out of the box.
    const stored = localStorage.getItem("sii-sidebar");
    if (stored === "collapsed") return true;
    if (stored === "expanded") return false;
    return window.innerWidth < 1100;
  });

  function toggle() {
    setCollapsed((c) => {
      localStorage.setItem("sii-sidebar", c ? "expanded" : "collapsed");
      return !c;
    });
  }

  async function handleSignOut() {
    setBusy(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOutEverywhere();
    router.navigate({ to: "/auth", replace: true });
  }

  const home = items[0];
  const isActive = (to: string) =>
    to === home?.to ? pathname === to : pathname === to || pathname.startsWith(to + "/");
  const current =
    [...items].sort((a, b) => b.to.length - a.to.length).find((i) => isActive(i.to)) ?? home;
  const isHome = pathname === home?.to;
  // Deeper than a nav item (e.g. /judge/evaluate/x) → back goes to that section.
  const deeper = current && pathname !== current.to;
  const backTo = deeper ? current.to : home?.to;

  const avatar = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clay/15 text-sm font-semibold text-clay">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );

  return (
    <>
      {/* Desktop left sidebar */}
      <aside
        data-app-sidebar={collapsed ? "collapsed" : "expanded"}
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-card transition-[width] duration-200 md:flex",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex items-center border-b border-border",
            collapsed ? "flex-col justify-center gap-2 px-2 py-3" : "justify-between px-4 py-3",
          )}
        >
          <img
            src={icorgLogo.url}
            alt="ICORG"
            className={cn("w-auto", collapsed ? "h-5" : "h-9")}
          />
          <button
            onClick={toggle}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Main">
          {!collapsed && (
            <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Menu
            </p>
          )}
          {items.map((item) => {
            const active = current?.to === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-forest text-linen"
                    : "text-foreground/75 hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted",
                  collapsed && "justify-center px-0",
                )}
              >
                {avatar}
                {!collapsed && <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuLabel className="text-muted-foreground">{name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} disabled={busy}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Top bar: back button + breadcrumb (all sizes) */}
      <header className="no-print sticky top-0 z-30 border-b border-border bg-linen/90 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 md:h-16 md:px-8">
          {!isHome && backTo ? (
            <Button variant="ghost" size="sm" asChild className="-ml-1 shrink-0 gap-1.5 px-2">
              <Link to={backTo} aria-label="Go back">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back</span>
              </Link>
            </Button>
          ) : (
            <span className="md:hidden">
              <Brand compact />
            </span>
          )}
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
            {home && !isHome && (
              <>
                <Link to={home.to} className="hidden shrink-0 text-muted-foreground hover:text-foreground sm:inline">
                  {home.label}
                </Link>
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:inline" />
              </>
            )}
            {deeper && current && current !== home && (
              <>
                <Link to={current.to} className="hidden shrink-0 text-muted-foreground hover:text-foreground sm:inline">
                  {current.label}
                </Link>
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:inline" />
              </>
            )}
            <span className="truncate font-semibold text-forest">
              {deeper ? "Details" : current?.label}
            </span>
          </nav>
          <span className="hidden shrink-0 items-baseline gap-2 md:flex" aria-hidden>
            <span className="font-display text-sm font-semibold text-forest">
              Social Innovation Ideathon
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Organized by ICORG
            </span>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="shrink-0 md:hidden" aria-label="Account">
                {avatar}
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
                current?.to === item.to ? "text-clay" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              {MOBILE_SHORT[item.label] ?? item.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
