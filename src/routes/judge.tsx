import { redirect, Outlet, createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { getAuthContext, homeFor } from "@/lib/auth";
import type { Profile } from "@/lib/auth";

export const Route = createFileRoute("/judge")({
  ssr: false,
  beforeLoad: async () => {
    const ctx = await getAuthContext();
    if (!ctx) throw redirect({ to: "/auth" });
    if (!ctx.roles.includes("judge")) throw redirect({ to: homeFor(ctx.roles) });
    return { roles: ctx.roles, profile: ctx.profile };
  },
  component: JudgeLayout,
});

function JudgeLayout() {
  const { profile } = Route.useRouteContext() as { roles: string[]; profile: Profile | null };
  return (
    <div className="app-shell min-h-screen bg-linen">
      <AppNav role="judge" name={profile?.full_name ?? "Evaluator"} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 md:pb-12 md:px-6">
        <Outlet />
      </main>
    </div>
  );
}
