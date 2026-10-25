import { redirect, Outlet, createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { getAuthContext, homeFor } from "@/lib/auth";
import type { Profile } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const ctx = await getAuthContext();
    if (!ctx) throw redirect({ to: "/auth" });
    if (!ctx.roles.includes("admin")) throw redirect({ to: homeFor(ctx.roles) });
    return { roles: ctx.roles, profile: ctx.profile };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { profile } = Route.useRouteContext() as { roles: string[]; profile: Profile | null };
  return (
    <div className="app-shell min-h-screen bg-linen">
      <AppNav role="admin" name={profile?.full_name ?? "Administrator"} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 md:pb-12 md:px-6">
        <Outlet />
      </main>
    </div>
  );
}
