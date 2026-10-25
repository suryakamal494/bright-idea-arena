import { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/app-nav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/parent-revoke")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Parent consent revocation — Social Innovation Ideathon" },
      {
        name: "description",
        content: "One-click revocation of a student's participation access, sent to parents by link.",
      },
      { property: "og:title", content: "Parent consent revocation" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ParentRevoke,
});

function ParentRevoke() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function revoke() {
    if (!token) return;
    setState("busy");
    const { data, error } = await supabase.rpc("revoke_parent_access", { p_token: token });
    if (error || !data) {
      setState("error");
      setMessage(
        error?.message ?? "This link is invalid or has already been used. Contact the organisers if you believe this is a mistake.",
      );
      return;
    }
    setState("done");
  }

  return (
    <div className="flex min-h-screen flex-col bg-linen">
      <header className="mx-auto w-full max-w-3xl px-5 py-5">
        <Brand />
      </header>
      <main className="mx-auto w-full max-w-md px-5 pb-16">
        <div className="rounded-2xl border border-border bg-card p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-clay/12 text-clay">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <h1 className="font-display mt-4 text-2xl font-semibold text-forest">
            Restrict participation access
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            You've followed a parent notification link. Confirming below will immediately restrict
            the linked student's account and sign them out of the ideathon platform. This cannot be
            undone from this page — contact the school coordinator to restore access.
          </p>

          {state === "done" ? (
            <div className="mt-5 rounded-lg border border-sage/30 bg-sage/10 p-4">
              <p className="flex items-center gap-2 font-semibold text-secondary-foreground">
                <ShieldCheck className="h-4 w-4" /> Access restricted
              </p>
              <p className="mt-1 text-sm text-secondary-foreground/90">
                The student's account has been deactivated. No further submissions are possible from
                that account.
              </p>
            </div>
          ) : state === "error" ? (
            <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {message}
            </div>
          ) : !token ? (
            <p className="mt-5 text-sm text-destructive">
              This link is missing its access token. Please use the exact link from your notification
              message.
            </p>
          ) : (
            <Button
              className="mt-5 w-full bg-clay hover:bg-clay/90"
              onClick={revoke}
              disabled={state === "busy"}
            >
              {state === "busy" ? "Confirming…" : "Confirm restriction"}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
