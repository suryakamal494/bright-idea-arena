import { redirect, createFileRoute } from "@tanstack/react-router";
import { createPageHead } from "@/lib/brand-meta";

// The sign-in screen lives on the homepage now; this address redirects to it.
export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    throw redirect({ to: "/" });
  },
  head: () => createPageHead("Sign in", "Sign in to your ICORG Social Innovation Ideathon account."),
});
