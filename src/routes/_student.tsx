import { redirect, Outlet, createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app-nav";
import { CompleteProfile } from "@/components/complete-profile";
import { clearAuthContext, getAuthContext } from "@/lib/auth";
import type { Profile } from "@/lib/auth";

export const Route = createFileRoute("/_student")({
  ssr: false,
  beforeLoad: async () => {
    const ctx = await getAuthContext();
    if (!ctx) throw redirect({ to: "/auth" });
    const { roles, profile } = ctx;
    if (roles.length === 0) {
      // Account with no role assigned yet — nothing to show, sign out safely.
      clearAuthContext();
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    if (roles.includes("admin")) throw redirect({ to: "/admin" });
    if (roles.includes("judge")) throw redirect({ to: "/judge" });
    if (roles.includes("coordinator") && !roles.includes("student")) {
      throw redirect({ to: "/coordinator" });
    }
    return { roles, profile };
  },
  component: StudentLayout,
});

function StudentLayout() {
  const { profile } = Route.useRouteContext() as { roles: string[]; profile: Profile | null };

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
    <div className="app-shell min-h-screen bg-linen">
      <AppNav role="student" name={profile.full_name} />
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 md:px-8 md:pb-12">
        <Outlet />
      </main>
    </div>
  );
}
