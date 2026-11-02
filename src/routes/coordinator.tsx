import { redirect, Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { getAuthContext, homeFor } from "@/lib/auth";
import type { Profile } from "@/lib/auth";

export const Route = createFileRoute("/coordinator")({
  ssr: false,
  beforeLoad: async () => {
    const ctx = await getAuthContext();
    if (!ctx) throw redirect({ to: "/auth" });
    if (ctx.roles.includes("admin")) throw redirect({ to: "/admin" });
    if (ctx.roles.includes("judge")) throw redirect({ to: "/judge" });
    return { roles: ctx.roles, profile: ctx.profile };
  },
  component: CoordinatorLayout,
});

function CoordinatorLayout() {
  const { roles, profile } = Route.useRouteContext() as { roles: string[]; profile: Profile | null };
  const isCoordinator = roles.includes("coordinator");

  return (
    <div className="app-shell min-h-screen bg-linen">
      {isCoordinator && <AppNav role="coordinator" name={profile?.full_name ?? "Coordinator"} />}
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 md:pb-12">
        {isCoordinator ? (
          <Outlet />
        ) : (
          <NotCoordinator profile={profile} />
        )}
      </main>
    </div>
  );
}


import { School } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A signed-in user without the coordinator role. Coordinator access is
 * granted automatically during school registration — there is no claim step.
 */
function NotCoordinator({ profile }: { profile: Profile | null }) {
  return (
    <div className="mx-auto max-w-md pt-10">
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-clay/12 text-clay">
          <School className="h-6 w-6" />
        </span>
        <h1 className="font-display mt-4 text-2xl font-semibold text-forest">
          School coordinator portal
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{profile?.full_name}</span> (
          {profile?.email}). This account doesn't have coordinator access — only the faculty
          coordinator registered for a school can open this portal.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          If your school hasn't registered yet, its teacher can register it from the{" "}
          <a href="/school-register" className="font-medium text-clay underline underline-offset-2">
            school registration page
          </a>
          . Students can head straight to their dashboard.
        </p>
        <Button asChild className="mt-5 w-full bg-clay hover:bg-clay/90">
          <Link to="/dashboard">Go to my dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

