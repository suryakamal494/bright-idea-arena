import { redirect, createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";
import { fetchMyRoles, homeFor } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const roles = await fetchMyRoles();
    if (roles.length > 0) throw redirect({ to: homeFor(roles) });
  },
  head: () => ({
    meta: [
      {
        title: "Sign in — Social Innovation Ideathon",
        name: "description",
        content:
          "Sign in or register for the Social Innovation Ideathon — a two-stage national ideathon for student innovators in grades 8–12.",
      },
      { property: "og:title", content: "Sign in — Social Innovation Ideathon" },
      {
        property: "og:description",
        content: "Sign in to form a team, submit your concept note and reach the final prototype round.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});
