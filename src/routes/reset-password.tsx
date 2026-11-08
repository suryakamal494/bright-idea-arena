import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { MIN_PASSWORD, friendlyAuthError, validateNewPassword } from "@/components/change-password-dialog";
import { clearAuthContext, getAuthContext, homeFor } from "@/lib/auth";
import icorgLogo from "@/assets/icorg-logo.png.asset.json";
import { createPageHead } from "@/lib/brand-meta";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => {
    const pageHead = createPageHead(
      "Reset password",
      "Choose a new password for your ICORG Social Innovation Ideathon account.",
    );
    return { ...pageHead, meta: [...pageHead.meta, { name: "robots", content: "noindex" }] };
  },
  component: ResetPasswordPage,
});

type Phase = "checking" | "ready" | "invalid" | "done";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    if (hash.get("error") || query.get("error")) {
      setPhase("invalid");
      return;
    }
    let settled = false;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && hash.get("type") === "recovery")) {
        settled = true;
        setPhase("ready");
      }
    });
    (async () => {
      const code = query.get("code");
      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        if (err) { settled = true; setPhase("invalid"); return; }
        settled = true; setPhase("ready"); return;
      }
      const isRecoveryLink = hash.get("type") === "recovery";
      const { data: s } = await supabase.auth.getSession();
      if (s.session && isRecoveryLink) { settled = true; setPhase("ready"); }
    })();
    const t = window.setTimeout(() => { if (!settled) setPhase("invalid"); }, 4000);
    return () => { data.subscription.unsubscribe(); window.clearTimeout(t); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateNewPassword(pw, confirm);
    if (v) return setError(v);
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) {
      if (/session|jwt|expired/i.test(err.message)) return setPhase("invalid");
      return setError(friendlyAuthError(err.message));
    }
    setPhase("done");
    toast.success("Password updated.");
    window.history.replaceState(null, "", "/reset-password");
    clearAuthContext();
    const ctx = await getAuthContext();
    navigate({ to: homeFor(ctx?.roles ?? []), replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linen px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 p-6">
          <img src={icorgLogo.url} alt="ICORG" className="h-9 w-auto" />
          <div>
            <h1 className="font-display text-2xl font-semibold text-forest">Set a new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">Social Innovation Ideathon</p>
          </div>
          {phase === "checking" && <p className="text-sm text-muted-foreground">Checking your reset link…</p>}
          {phase === "invalid" && (
            <div className="space-y-4">
              <p className="rounded-lg border border-border bg-muted p-3 text-sm">
                This reset link has expired or was already used. Request a new one from the sign-in page.
              </p>
              <Button asChild className="w-full bg-clay hover:bg-clay/90">
                <Link to="/">Request a new link</Link>
              </Button>
            </div>
          )}
          {phase === "done" && <p className="text-sm">Password updated. Taking you to your dashboard…</p>}
          {phase === "ready" && (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rp-new">New password</Label>
                <Input id="rp-new" type={show ? "text" : "password"} autoComplete="new-password" required minLength={MIN_PASSWORD} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="8+ characters" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rp-confirm">Confirm new password</Label>
                <Input id="rp-confirm" type={show ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
              </label>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" className="w-full bg-clay hover:bg-clay/90" disabled={busy}>
                {busy ? "Saving…" : "Save new password"}
              </Button>
            </form>
          )}
          <Link to="/" className="block text-center text-sm text-muted-foreground hover:text-foreground">← Back to sign in</Link>
        </CardContent>
      </Card>
    </div>
  );
}
