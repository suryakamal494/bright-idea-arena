import { redirect, Outlet, createFileRoute } from "@tanstack/react-router";
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
    <div className="min-h-screen bg-linen">
      {isCoordinator && <AppNav role="coordinator" name={profile?.full_name ?? "Coordinator"} />}
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 md:pb-12">
        {isCoordinator ? (
          <Outlet />
        ) : (
          <ClaimCoordinator profile={profile} />
        )}
      </main>
    </div>
  );
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { School } from "lucide-react";
import { Button } from "@/components/ui/button";
import { claimCoordinatorRole } from "@/lib/coordinator-actions";

function ClaimCoordinator({ profile }: { profile: Profile | null }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function claim() {
    setBusy(true);
    try {
      const res = await claimCoordinatorRole();
      toast.success(`Coordinator access granted for ${res.school}`);
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not claim coordinator role");
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-md pt-10">
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-clay/12 text-clay">
          <School className="h-6 w-6" />
        </span>
        <h1 className="font-display mt-4 text-2xl font-semibold text-forest">
          Claim coordinator access
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{profile?.full_name}</span> (
          {profile?.email}). Confirm below to become the coordinator for{" "}
          <span className="font-medium text-foreground">{profile?.school_name}</span> and unlock the
          roster portal, bulk student registration and printable access passes.
        </p>
        {!profile?.school_name && (
          <p className="mt-3 text-sm text-destructive">
            Your profile has no school name yet — complete your profile first.
          </p>
        )}
        <Button
          className="mt-5 w-full bg-clay hover:bg-clay/90"
          onClick={claim}
          disabled={busy || !profile?.school_name}
        >
          {busy ? "Claiming…" : "I am the coordinator for this school"}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          One coordinator per school. The first claim for a school is accepted.
        </p>
      </div>
    </div>
  );
}
