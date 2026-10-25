import { redirect, Outlet, createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { fetchMyProfile, fetchMyRoles, getSessionUser, homeFor } from "@/lib/auth";
import type { Profile } from "@/lib/auth";

export const Route = createFileRoute("/judge")({
  ssr: false,
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/auth" });
    const roles = await fetchMyRoles();
    if (!roles.includes("judge")) throw redirect({ to: homeFor(roles) });
    const profile = await fetchMyProfile();
    return { roles, profile };
  },
  component: JudgeLayout,
});

function JudgeLayout() {
  const { profile } = Route.useRouteContext<{ roles: string[]; profile: Profile | null }>();
  return (
    <div className="min-h-screen bg-linen">
      <AppNav role="judge" name={profile?.full_name ?? "Evaluator"} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 md:pb-12 md:px-6">
        <Outlet />
      </main>
    </div>
  );
}
