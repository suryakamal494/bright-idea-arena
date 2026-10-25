import { redirect, createFileRoute } from "@tanstack/react-router";

// The sign-in screen lives on the homepage now; this address redirects to it.
export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [{ title: "Sign in — Social Innovation Ideathon" }],
  }),
});
