import { redirect, Outlet, createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app-nav";
import { CompleteProfile } from "@/components/complete-profile";
import { fetchMyProfile, fetchMyRoles, getSessionUser } from "@/lib/auth";
import type { Profile } from "@/lib/auth";

export const Route = createFileRoute("/_student")({
  ssr: false,
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/auth" });
    const roles = await fetchMyRoles();
    if (roles.length === 0) {
      // Account with no role assigned yet — nothing to show, sign out safely.
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    if (roles.includes("admin")) throw redirect({ to: "/admin" });
    if (roles.includes("judge")) throw redirect({ to: "/judge" });
    if (roles.includes("coordinator") && !roles.includes("student")) {
      throw redirect({ to: "/coordinator" });
    }
    const profile = await fetchMyProfile();
    if (!profile) {
      // Authenticated but no profile row — treat as incomplete; page will prompt.
      return { roles, profile: null };
    }
    return { roles, profile };
  },
  component: StudentLayout,
});

function StudentLayout() {
  const { profile } = Route.useRouteContext<{ roles: string[]; profile: Profile | null }>();

  if (!profile || !profile.grade || !profile.school_name) {
    return profile ? (
      <CompleteProfile
        profile={profile}
        onDone={() => window.location.reload()}
      />
    ) : (
      <div className="flex min-h-screen items-center justify-center bg-linen px-4 text-center text-sm text-muted-foreground">
        Your account is missing a profile. Please contact the organisers.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linen">
      <AppNav role="student" name={profile.full_name} />
      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 md:pb-12">
        <Outlet />
      </main>
    </div>
  );
}
