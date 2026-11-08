import { redirect, createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";
import { getAuthContext, homeFor } from "@/lib/auth";
import { createPageHead } from "@/lib/brand-meta";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const ctx = await getAuthContext();
    if (ctx && ctx.roles.length > 0) throw redirect({ to: homeFor(ctx.roles) });
  },
  head: () =>
    createPageHead(
      "Sign in",
      "An innovation platform empowering students in grades 8–12 to design impactful community solutions through creative problem-solving and teamwork.",
      { shareImage: true },
    ),
  component: AuthPage,
});
