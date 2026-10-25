import { redirect, Outlet, createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { fetchMyProfile, fetchMyRoles, getSessionUser, homeFor } from "@/lib/auth";
import type { Profile } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/auth" });
    const roles = await fetchMyRoles();
    if (!roles.includes("admin")) throw redirect({ to: homeFor(roles) });
    const profile = await fetchMyProfile();
    return { roles, profile };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { profile } = Route.useRouteContext() as { roles: string[]; profile: Profile | null };
  return (
    <div className="min-h-screen bg-linen">
      <AppNav role="admin" name={profile?.full_name ?? "Administrator"} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 md:pb-12 md:px-6">
        <Outlet />
      </main>
    </div>
  );
}
